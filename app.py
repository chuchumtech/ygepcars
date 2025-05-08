# Minimal Flask app for YGEP Car Rental
import os
import certifi
os.environ["SSL_CERT_FILE"] = certifi.where()
from flask import Flask, render_template, request, redirect, url_for, session, flash
from pymongo import MongoClient
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'replace_this_with_a_secret_key'

# MongoDB Atlas connection
MONGO_URI = "mongodb+srv://shlomo:RzperDVpwMyPVyTV@ygep.cmuf7f8.mongodb.net/?retryWrites=true&w=majority&appName=ygep"
client = MongoClient(MONGO_URI)
db = client['ygep']  # Use 'ygep' as the main database

users_col = db['users']
cars_col = db['cars']
bookings_col = db['bookings']

@app.context_processor
def inject_now():
    return {'now': datetime.now()}

# --- Database Setup ---
def init_db():
    # Insert default cars if not already present
    if cars_col.count_documents({}) == 0:
        cars_col.insert_many([
            {'name': '2023 Subaru Legacy', 'year': 2023, 'color': 'Blue', 'image': 'subaru_legacy_blue.jpg'},
            {'name': '2024 Toyota Corolla', 'year': 2024, 'color': 'White', 'image': 'toyota_corolla_white.jpg'}
        ])


# --- Routes ---
@app.route('/')
def index():
    # Generate 30-min interval times for dropdowns
    from datetime import datetime, timedelta
    times = []
    for i in range(0, 24*60, 30):
        t = (datetime.strptime('00:00', '%H:%M') + timedelta(minutes=i))
        val = t.strftime('%H:%M')
        disp = t.strftime('%I:%M %p').lstrip('0').replace(' 0', ' ')
        times.append({'value': val, 'display': disp})
    return render_template('index.html', times=times)

@app.route('/search', methods=['GET'])
def search():
    from datetime import datetime, timedelta
    # Get date and time fields from form
    pickup_date = request.args.get('pickup_date')
    pickup_time = request.args.get('pickup_time')
    return_date = request.args.get('return_date')
    return_time = request.args.get('return_time')
    cars = []
    if pickup_date and pickup_time and return_date and return_time:
        # Combine into datetime strings for DB logic
        start_time = f"{pickup_date} {pickup_time}"
        end_time = f"{return_date} {return_time}"
        # Get all cars from MongoDB
        now = datetime.utcnow()
        for car in cars_col.find():
            # Check for bookings that block this car
            blocking = False
            for booking in bookings_col.find({'car_id': str(car['_id'])}):
                # Expire old pending requests
                if booking.get('status') == 'pending':
                    try:
                        requested_at = datetime.strptime(booking.get('requested_at', ''), '%Y-%m-%d %H:%M')
                        if (now - requested_at) > timedelta(hours=48):
                            # Expire it
                            bookings_col.update_one({'_id': booking['_id']}, {'$set': {'status': 'expired'}})
                            continue
                    except Exception:
                        continue
                # Block if approved, or pending and not expired
                if booking.get('status') == 'approved' or (booking.get('status') == 'pending' and (now - datetime.strptime(booking.get('requested_at', ''), '%Y-%m-%d %H:%M')) <= timedelta(hours=48)):
                    # Overlap logic
                    s1, e1 = booking['start_time'], booking['end_time']
                    if not (end_time <= s1 or start_time >= e1):
                        blocking = True
                        break
            cars.append({
                'id': str(car['_id']),
                'name': car['name'],
                'year': car['year'],
                'color': car['color'],
                'image': car['image'],
                'available': not blocking
            })
        # Format user-friendly date strings
        def friendly(dt_str):
            try:
                dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
                return dt.strftime("%A, %B %-d, %Y at %-I:%M %p")
            except Exception:
                return dt_str
        start_time_friendly = friendly(start_time)
        end_time_friendly = friendly(end_time)
        return render_template('search.html', cars=cars, start_time=start_time, end_time=end_time,
                              start_time_friendly=start_time_friendly, end_time_friendly=end_time_friendly)
    else:
        # If no dates entered, redirect to home
        return redirect(url_for('index'))

@app.route('/reserve', methods=['POST'])
def reserve():
    # Get form data
    car_id = request.form['car_id']
    start_time = request.form['start_time']
    end_time = request.form['end_time']
    # Save info in session and redirect to checkout
    session['reserve_car_id'] = car_id
    session['reserve_start_time'] = start_time
    session['reserve_end_time'] = end_time
    return redirect(url_for('checkout'))

@app.route('/checkout', methods=['GET', 'POST'])
def checkout():
    from datetime import datetime, timedelta
    if 'user_id' not in session:
        flash('Please log in to complete your reservation.')
        return redirect(url_for('login'))
    # Get info from session
    car_id = session.get('reserve_car_id')
    start_time = session.get('reserve_start_time')
    end_time = session.get('reserve_end_time')
    if not car_id or not start_time or not end_time:
        flash('Reservation info missing. Please search again.')
        return redirect(url_for('index'))
    # Get car info from MongoDB
    car = cars_col.find_one({'_id': ObjectId(car_id)})
    if not car:
        flash('Car not found.')
        return redirect(url_for('index'))
    car = {'id': str(car['_id']), 'name': car['name'], 'year': car['year'], 'color': car['color'], 'image': car['image']}
    # Get user info from MongoDB
    user = users_col.find_one({'_id': ObjectId(session['user_id'])})
    user = {
        'name': user.get('name', ''),
        'email': user.get('email', ''),
        'phone': user.get('phone', '')
    }
    # Calculate price
    dt_fmt = '%Y-%m-%d %H:%M'
    try:
        dt_start = datetime.strptime(start_time, dt_fmt)
        dt_end = datetime.strptime(end_time, dt_fmt)
        duration_hours = int((dt_end - dt_start).total_seconds() // 3600)
        if duration_hours < 1:
            duration_hours = 1
        total_price = min(duration_hours * 15, 70)
        start_time_friendly = dt_start.strftime('%A, %B %-d, %Y at %-I:%M %p')
        end_time_friendly = dt_end.strftime('%A, %B %-d, %Y at %-I:%M %p')
    except Exception:
        duration_hours = 1
        total_price = 15
        start_time_friendly = start_time
        end_time_friendly = end_time
    if request.method == 'POST':
        # Save the reservation request for admin approval, with 48-hour pending hold
        now = datetime.utcnow()
        bookings_col.insert_one({
            'user_id': session['user_id'],
            'car_id': car_id,
            'start_time': start_time,
            'end_time': end_time,
            'status': 'pending',
            'requested_at': now.strftime('%Y-%m-%d %H:%M'),
        })
        flash('Your reservation request has been submitted and is pending admin approval.')
        # Optionally clear reservation session info
        session.pop('reserve_car_id', None)
        session.pop('reserve_start_time', None)
        session.pop('reserve_end_time', None)
        return redirect(url_for('index'))
    return render_template('checkout.html', car=car, user=user, start_time_friendly=start_time_friendly, end_time_friendly=end_time_friendly, duration_hours=duration_hours, total_price=total_price)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        phone = request.form['phone']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        if not all([name, email, phone, password, confirm_password]):
            flash('All fields are required.')
            return render_template('register.html')
        if password != confirm_password:
            flash('Passwords do not match.')
            return render_template('register.html')
        if users_col.find_one({'email': email}):
            flash('Email already registered.')
            return render_template('register.html')
        hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
        users_col.insert_one({'name': name, 'email': email, 'phone': phone, 'password': hashed_password})
        flash('Registration successful. Please log in.')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        user = users_col.find_one({'email': email})
        if user and check_password_hash(user['password'], password):
            session['user_id'] = str(user['_id'])
            session['username'] = user['name']
            session['email'] = user['email']
            session['phone'] = user['phone']
            # If there was a pending booking, complete it now
            pending = session.pop('pending_booking', None)
            if pending:
                return redirect(url_for('reserve_after_login'))
            return redirect(url_for('index'))
        else:
            flash('Invalid email or password.')
    return render_template('login.html')

@app.route('/reserve_after_login')
def reserve_after_login():
    pending = session.pop('pending_booking', None)
    if not pending:
        return redirect(url_for('index'))
        return redirect(url_for('calendar'))
    car_id = pending['car_id']
    start_time = pending['start_time']
    end_time = pending['end_time']
    user_id = session['user_id']
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        # Check if user already has a booking for this time
        c.execute('''SELECT 1 FROM bookings WHERE user_id=? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))''',
                  (user_id, end_time, start_time, start_time, end_time, start_time, end_time))
        if c.fetchone():
            flash('You already have a booking during this time.')
            return redirect(url_for('search', start_time=start_time, end_time=end_time))
        # Check if car is already booked
        c.execute('''SELECT 1 FROM bookings WHERE car_id=? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))''',
                  (car_id, end_time, start_time, start_time, end_time, start_time, end_time))
    return redirect(url_for('calendar'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/calendar')
def calendar():
    if 'user_id' not in session:
        flash('Please log in to view your bookings.')
        return redirect(url_for('login'))
    user_id = session['user_id']
    bookings = []
    for booking in bookings_col.find({'user_id': user_id}):
        car = cars_col.find_one({'_id': ObjectId(booking['car_id'])})
        bookings.append((
            str(booking['_id']),
            car['name'] if car else '',
            car['year'] if car else '',
            car['color'] if car else '',
            booking['start_time'],
            booking['end_time'],
        ))
    # Format friendly date strings
    def friendly(dt_str):
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return dt.strftime("%A, %B %-d, %Y at %-I:%M %p")
        except Exception:
            return dt_str
    bookings_friendly = []
    for b in bookings:
        bookings_friendly.append((b[0], b[1], b[2], b[3], b[4], b[5], friendly(b[4]), friendly(b[5])))
    return render_template('calendar.html', bookings=bookings_friendly)

@app.route('/book', methods=['POST'])
def book():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    car_id = int(request.form['car_id'])
    start_time = request.form['start_time']
    end_time = request.form['end_time']
    user_id = session['user_id']
    # Check if user already has a booking for this time
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''SELECT * FROM bookings WHERE user_id=? AND (
            (start_time <= ? AND end_time > ?) OR
            (start_time < ? AND end_time >= ?) OR
            (start_time >= ? AND end_time <= ?)
        )''', (user_id, start_time, start_time, end_time, end_time, start_time, end_time))
        if c.fetchone():
            flash('You already have a booking during this time.')
            return redirect(url_for('calendar'))
        # Check if car is already booked
        c.execute('''SELECT * FROM bookings WHERE car_id=? AND (
            (start_time <= ? AND end_time > ?) OR
            (start_time < ? AND end_time >= ?) OR
            (start_time >= ? AND end_time <= ?)
        )''', (car_id, start_time, start_time, end_time, end_time, start_time, end_time))
        if c.fetchone():
            flash('Car is already booked for this time.')
            return redirect(url_for('calendar'))
        # Otherwise, book
        c.execute('INSERT INTO bookings (user_id, car_id, start_time, end_time) VALUES (?, ?, ?, ?)',
                  (user_id, car_id, start_time, end_time))
        conn.commit()
        flash('Booking successful!')
    return redirect(url_for('calendar'))

# --- Edit Reservation ---
from flask import abort

@app.route('/edit_reservation/<reservation_id>', methods=['GET', 'POST'])
def edit_reservation(reservation_id):
    from datetime import datetime, timedelta
    if 'user_id' not in session:
        flash('Please log in to edit a reservation.')
        return redirect(url_for('login'))
    booking = bookings_col.find_one({'_id': ObjectId(reservation_id), 'user_id': session['user_id']})
    if not booking:
        abort(404)
    car = cars_col.find_one({'_id': ObjectId(booking['car_id'])})
    if not car:
        flash('Car not found.')
        return redirect(url_for('calendar'))
    # Expire pending_update if >48h
    if booking.get('status') == 'pending_update':
        try:
            requested_at = datetime.strptime(booking.get('requested_at', ''), '%Y-%m-%d %H:%M')
            if (datetime.utcnow() - requested_at) > timedelta(hours=48):
                bookings_col.update_one({'_id': booking['_id']}, {'$set': {'status': 'expired'}})
                booking['status'] = 'expired'
        except Exception:
            pass
    if request.method == 'POST':
        new_start = request.form['start_time']
        new_end = request.form['end_time']
        # Check for overlap with other users' bookings (approved and unexpired pending/pending_update)
        now = datetime.utcnow()
        overlap = None
        for b in bookings_col.find({'car_id': booking['car_id'], '_id': {'$ne': booking['_id']}}):
            # Expire pending/pending_update if >48h
            if b.get('status') in ('pending', 'pending_update'):
                try:
                    req_at = datetime.strptime(b.get('requested_at', ''), '%Y-%m-%d %H:%M')
                    if (now - req_at) > timedelta(hours=48):
                        bookings_col.update_one({'_id': b['_id']}, {'$set': {'status': 'expired'}})
                        continue
                except Exception:
                    continue
            if b.get('status') == 'approved' or (b.get('status') in ('pending', 'pending_update') and (now - datetime.strptime(b.get('requested_at', ''), '%Y-%m-%d %H:%M')) <= timedelta(hours=48)):
                s1, e1 = b['start_time'], b['end_time']
                if not (new_end <= s1 or new_start >= e1):
                    overlap = b
                    break
        if overlap:
            flash('Car is not available for the new time requested.')
            return redirect(url_for('edit_reservation', reservation_id=reservation_id))
        # Mark as pending_update for admin approval, set requested_at
        bookings_col.update_one({'_id': booking['_id']}, {'$set': {
            'start_time': new_start,
            'end_time': new_end,
            'status': 'pending_update',
            'requested_at': now.strftime('%Y-%m-%d %H:%M')
        }})
        flash('Update request submitted and pending approval. The car will be held for 48 hours pending admin action.')
        return redirect(url_for('calendar'))
    # Render edit form
    return render_template('edit_reservation.html', booking=booking, car=car)

# --- Delete Reservation ---
@app.route('/delete_reservation/<reservation_id>', methods=['POST'])
def delete_reservation(reservation_id):
    if 'user_id' not in session:
        flash('Please log in to delete a reservation.')
        return redirect(url_for('login'))
    booking = bookings_col.find_one({'_id': ObjectId(reservation_id), 'user_id': session['user_id']})
    if not booking:
        abort(404)
    bookings_col.delete_one({'_id': booking['_id']})
    flash('Reservation deleted.')
    return redirect(url_for('calendar'))

init_db()

if __name__ == '__main__':
    app.run(debug=True)
