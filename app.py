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

# Jinja filter for friendly date
@app.template_filter('friendly_date')
def friendly_date(dt_str):
    try:
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        return dt.strftime("%b %d, %Y %I:%M %p")
    except Exception:
        return dt_str

# MongoDB Atlas connection
MONGO_URI = "mongodb+srv://shlomo:RzperDVpwMyPVyTV@ygep.cmuf7f8.mongodb.net/?retryWrites=true&w=majority&appName=ygep"
client = MongoClient(MONGO_URI)
db = client['ygep']  # Use 'ygep' as the main database

users_col = db['users']
cars_col = db['cars']
bookings_col = db['bookings']
standard_rates_col = db['standard_rates']
special_rates_col = db['special_rates']

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
from models.pricing_utils import get_applicable_rate, calculate_price

def require_admin():
    if not session.get('user_id'):
        flash('Not authorized. Please log in.')
        session.clear()
        return redirect(url_for('login'))
    admin_user = users_col.find_one({'_id': ObjectId(session['user_id'])})
    if not admin_user or not admin_user.get('is_admin', False):
        flash('Admin access required. You have been logged out.')
        session.clear()
        return redirect(url_for('login'))
    return None

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
        duration_hours = round((dt_end - dt_start).total_seconds() / 3600, 2)
        if duration_hours < 1:
            duration_hours = 1
        # Get rates from DB
        std_rates = {r['car_id']: r for r in standard_rates_col.find({})}
        special_rates = list(special_rates_col.find({}))
        hourly_rate, daily_cap, rate_source = get_applicable_rate(car_id, dt_start, dt_end, std_rates, special_rates)
        if hourly_rate is None or daily_cap is None:
            flash('No pricing plan found for this car. Please contact admin.')
            return redirect(url_for('index'))
        total_price, days, hours = calculate_price(dt_start, dt_end, hourly_rate, daily_cap)
        start_time_friendly = dt_start.strftime('%b %d, %Y %I:%M %p')
        end_time_friendly = dt_end.strftime('%b %d, %Y %I:%M %p')
    except Exception:
        duration_hours = 1
        total_price = 15
        hourly_rate = daily_cap = days = hours = rate_source = None
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
    return render_template(
        'checkout.html',
        car=car,
        user=user,
        start_time_friendly=start_time_friendly,
        end_time_friendly=end_time_friendly,
        duration_hours=duration_hours,
        total_price=total_price,
        hourly_rate=hourly_rate,
        daily_cap=daily_cap,
        days=days,
        hours=hours,
        rate_source=rate_source
    )

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

# --- Admin Portal ---
from flask import abort, Blueprint

@app.route('/backend/pricing')
def backend_pricing():
    check = require_admin()
    if check:
        return check
    cars = list(cars_col.find({}))
    # Standard rates
    std_rates = {r['car_id']: r for r in standard_rates_col.find({})}
    # Special rates
    special_rates = list(special_rates_col.find({}))
    # Add car names to special_rates for display
    for rate in special_rates:
        if rate['car_id'] == 'global':
            rate['car_name'] = 'All Cars'
        else:
            car = cars_col.find_one({'_id': ObjectId(rate['car_id'])})
            rate['car_name'] = car['name'] if car else 'Unknown'
    return render_template('backend_pricing.html', cars=cars, standard_rates=std_rates, special_rates=special_rates)

@app.route('/backend/pricing/set_standard', methods=['POST'])
def backend_set_standard_rate():
    check = require_admin()
    if check:
        return check
    car_id = request.form['car_id']
    hourly_rate = float(request.form['hourly_rate'])
    daily_cap = float(request.form['daily_cap'])
    standard_rates_col.update_one({'car_id': car_id}, {'$set': {'hourly_rate': hourly_rate, 'daily_cap': daily_cap}}, upsert=True)
    flash('Standard rate updated.')
    return redirect(url_for('backend_pricing'))

@app.route('/backend/pricing/add_special', methods=['POST'])
def backend_add_special_rate():
    check = require_admin()
    if check:
        return check
    car_id = request.form['car_id']
    start_date = request.form['start_date']
    end_date = request.form['end_date']
    hourly_rate = float(request.form['hourly_rate'])
    daily_cap = float(request.form['daily_cap'])
    special_rates_col.insert_one({'car_id': car_id, 'start_date': start_date, 'end_date': end_date, 'hourly_rate': hourly_rate, 'daily_cap': daily_cap})
    flash('Special rate added.')
    return redirect(url_for('backend_pricing'))

@app.route('/backend/pricing/delete_special', methods=['POST'])
def backend_delete_special_rate():
    check = require_admin()
    if check:
        return check
    rate_id = request.form['rate_id']
    special_rates_col.delete_one({'_id': ObjectId(rate_id)})
    flash('Special rate deleted.')
    return redirect(url_for('backend_pricing'))

@app.route('/backend')
def backend_dashboard():
    return redirect(url_for('backend_pending'))

@app.route('/backend/pending')
def backend_pending():
    # Show all bookings with status pending or pending_update
    bookings = []
    for b in bookings_col.find({'status': {'$in': ['pending', 'pending_update']}}):
        car = cars_col.find_one({'_id': ObjectId(b['car_id'])})
        user = users_col.find_one({'_id': ObjectId(b['user_id'])})
        bookings.append({
            '_id': str(b['_id']),
            'car_name': car['name'] if car else 'Unknown',
            'user_name': user['name'] if user else 'Unknown',
            'start_time': b['start_time'],
            'end_time': b['end_time'],
            'status': b['status'],
            'requested_at': b.get('requested_at', '')
        })
    return render_template('backend_pending.html', bookings=bookings)

@app.route('/backend/approve/<booking_id>', methods=['POST'])
def backend_approve(booking_id):
    check = require_admin()
    if check:
        return check
    bookings_col.update_one({'_id': ObjectId(booking_id)}, {'$set': {'status': 'approved'}})
    flash('Booking approved.')
    return redirect(url_for('backend_pending'))


@app.route('/backend/deny/<booking_id>', methods=['POST'])
def backend_deny(booking_id):
    check = require_admin()
    if check:
        return check
    bookings_col.update_one({'_id': ObjectId(booking_id)}, {'$set': {'status': 'denied'}})
    flash('Booking denied.')
    return redirect(url_for('backend_pending'))


@app.route('/backend/live')
def backend_live():
    from datetime import datetime
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M')
    bookings = []
    for b in bookings_col.find({'status': 'approved'}):
        if b['start_time'] <= now <= b['end_time']:
            car = cars_col.find_one({'_id': ObjectId(b['car_id'])})
            user = users_col.find_one({'_id': ObjectId(b['user_id'])})
            bookings.append({
                'car_name': car['name'] if car else 'Unknown',
                'user_name': user['name'] if user else 'Unknown',
                'start_time': b['start_time'],
                'end_time': b['end_time'],
                'status': b['status']
            })
    return render_template('backend_live.html', bookings=bookings)

@app.route('/backend/upcoming')
def backend_upcoming():
    from datetime import datetime
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M')
    bookings = []
    for b in bookings_col.find({'status': 'approved'}):
        if b['start_time'] > now:
            car = cars_col.find_one({'_id': ObjectId(b['car_id'])})
            user = users_col.find_one({'_id': ObjectId(b['user_id'])})
            bookings.append({
                'car_name': car['name'] if car else 'Unknown',
                'user_name': user['name'] if user else 'Unknown',
                'start_time': b['start_time'],
                'end_time': b['end_time'],
                'status': b['status']
            })
    return render_template('backend_upcoming.html', bookings=bookings)

@app.route('/backend/past')
def backend_past():
    from datetime import datetime
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M')
    bookings = []
    for b in bookings_col.find({'status': 'approved'}):
        if b['end_time'] < now:
            car = cars_col.find_one({'_id': ObjectId(b['car_id'])})
            user = users_col.find_one({'_id': ObjectId(b['user_id'])})
            bookings.append({
                'car_name': car['name'] if car else 'Unknown',
                'user_name': user['name'] if user else 'Unknown',
                'start_time': b['start_time'],
                'end_time': b['end_time'],
                'status': b['status']
            })
    return render_template('backend_past.html', bookings=bookings)

@app.route('/backend/customers')
def backend_customers():
    users = []
    for u in users_col.find():
        users.append({
            '_id': str(u['_id']),
            'name': u.get('name', ''),
            'email': u.get('email', ''),
            'is_admin': u.get('is_admin', False)
        })
    return render_template('backend_customers.html', users=users)

@app.route('/backend/customers/<user_id>/toggle_admin', methods=['POST'])
def backend_toggle_admin(user_id):
    check = require_admin()
    if check:
        return check
    orig_user_id = user_id
    form_user_id = request.form.get('user_id')
    if form_user_id:
        user_id = form_user_id
    flash(f'[DEBUG] Received user_id: {user_id} (from form: {form_user_id}, url: {orig_user_id})')
    try:
        user_obj_id = ObjectId(user_id)
        flash(f'[DEBUG] Converted to ObjectId: {user_obj_id}')
    except Exception as e:
        flash(f'Invalid user id: {user_id} ({e})')
        return redirect(url_for('backend_customers'))
    user = users_col.find_one({'_id': user_obj_id})
    if not user:
        flash(f'[DEBUG] User not found for _id={user_obj_id}')
        return redirect(url_for('backend_customers'))
    if user.get('is_admin', False):
        result = users_col.update_one({'_id': user_obj_id}, {'$set': {'is_admin': False}})
        flash(f'Admin privileges removed. [DEBUG] Matched: {result.matched_count}, Modified: {result.modified_count}')
    else:
        result = users_col.update_one({'_id': user_obj_id}, {'$set': {'is_admin': True}})
        flash(f'User made admin. [DEBUG] Matched: {result.matched_count}, Modified: {result.modified_count}')
    next_url = request.args.get('next')
    if next_url:
        return redirect(next_url)
    referer = request.headers.get('Referer', '')
    if f'/backend/customers/{user_id}' in referer:
        return redirect(url_for('backend_customer_details', user_id=user_id))
    return redirect(url_for('backend_customers'))


@app.route('/backend/customers/<user_id>')
def backend_customer_details(user_id):
    user = users_col.find_one({'_id': ObjectId(user_id)})
    if not user:
        flash('User not found.')
        return redirect(url_for('backend_customers'))
    bookings = []
    from datetime import datetime
    def get_total_time(start_str, end_str):
        try:
            start = datetime.strptime(start_str, "%Y-%m-%d %H:%M")
            end = datetime.strptime(end_str, "%Y-%m-%d %H:%M")
            delta = end - start
            total_hours = int(delta.total_seconds() // 3600)
            days = total_hours // 24
            hours = total_hours % 24
            if days > 0:
                if hours > 0:
                    return f"{days} day{'s' if days > 1 else ''} {hours} hour{'s' if hours > 1 else ''}"
                else:
                    return f"{days} day{'s' if days > 1 else ''}"
            else:
                return f"{hours} hour{'s' if hours != 1 else ''}"
        except Exception:
            return "-"

    for b in bookings_col.find({'user_id': user_id}):
        car = cars_col.find_one({'_id': ObjectId(b['car_id'])})
        bookings.append({
            'car_name': car['name'] if car else 'Unknown',
            'start_time': b['start_time'],
            'end_time': b['end_time'],
            'status': b['status'],
            '_id': b['_id'],
            'total_time': get_total_time(b['start_time'], b['end_time'])
        })
    return render_template('backend_customer_details.html', user=user, bookings=bookings)

@app.route('/backend/customers/<user_id>/edit', methods=['POST'])
def backend_customer_edit(user_id):
    check = require_admin()
    if check:
        return check
    name = request.form.get('name','').strip()
    email = request.form.get('email','').strip()
    phone = request.form.get('phone','').strip()
    if not name or not email or not phone:
        flash('All fields are required.')
        return redirect(url_for('backend_customer_details', user_id=user_id))
    users_col.update_one({'_id': ObjectId(user_id)}, {'$set': {'name': name, 'email': email, 'phone': phone}})
    flash('User info updated.')
    return redirect(url_for('backend_customer_details', user_id=user_id))


@app.route('/backend/customers/<user_id>/change_password', methods=['POST'])
def backend_customer_change_password(user_id):
    user = users_col.find_one({'_id': ObjectId(user_id)})
    if not user:
        flash('User not found.')
        return redirect(url_for('backend_customers'))
    new_password = request.form.get('new_password')
    if not new_password or len(new_password) < 6:
        flash('Password must be at least 6 characters.')
        return redirect(url_for('backend_customer_details', user_id=user_id))
    hashed = generate_password_hash(new_password, method='pbkdf2:sha256')
    users_col.update_one({'_id': ObjectId(user_id)}, {'$set': {'password': hashed}})
    flash('Password updated.')
    return redirect(url_for('backend_customer_details', user_id=user_id))

@app.route('/backend/customers/<user_id>/toggle_lock', methods=['POST'])
def backend_customer_toggle_lock(user_id):
    user = users_col.find_one({'_id': ObjectId(user_id)})
    if not user:
        flash('User not found.')
        return redirect(url_for('backend_customers'))
    locked = user.get('locked', False)
    users_col.update_one({'_id': ObjectId(user_id)}, {'$set': {'locked': not locked}})
    flash('Account locked.' if not locked else 'Account unlocked.')
    return redirect(url_for('backend_customer_details', user_id=user_id))

@app.route('/backend/cars')
def backend_cars():
    cars = []
    for car in cars_col.find():
        cars.append({
            '_id': str(car['_id']),
            'name': car['name'],
            'year': car['year'],
            'color': car['color'],
            'image': car.get('image', '')
        })
    return render_template('backend_cars.html', cars=cars)

@app.route('/backend/cars/add', methods=['GET', 'POST'])
def backend_car_add():
    check = require_admin()
    if check:
        return check
    if request.method == 'POST':
        cars_col.insert_one({
            'name': request.form['name'],
            'year': request.form['year'],
            'color': request.form['color'],
            'image': request.form['image']
        })
        flash('Car added.')
        return redirect(url_for('backend_cars'))
    return render_template('backend_car_form.html', car=None)


@app.route('/backend/cars/edit/<car_id>', methods=['GET', 'POST'])
def backend_car_edit(car_id):
    car = cars_col.find_one({'_id': ObjectId(car_id)})
    if request.method == 'POST':
        cars_col.update_one({'_id': ObjectId(car_id)}, {'$set': {
            'name': request.form['name'],
            'year': request.form['year'],
            'color': request.form['color'],
            'image': request.form['image']
        }})
        flash('Car updated.')
        return redirect(url_for('backend_cars'))
    return render_template('backend_car_form.html', car=car)

@app.route('/backend/cars/delete/<car_id>', methods=['POST'])
def backend_car_delete(car_id):
    check = require_admin()
    if check:
        return check
    cars_col.delete_one({'_id': ObjectId(car_id)})
    flash('Car deleted.')
    return redirect(url_for('backend_cars'))


@app.route('/backend/destinations')
def backend_destinations():
    destinations = []
    for d in db['destinations'].find():
        destinations.append({'_id': str(d['_id']), 'name': d['name']})
    return render_template('backend_destinations.html', destinations=destinations)

@app.route('/backend/destinations/add', methods=['GET', 'POST'])
def backend_destination_add():
    if request.method == 'POST':
        db['destinations'].insert_one({'name': request.form['name']})
        flash('Destination added.')
        return redirect(url_for('backend_destinations'))
    return render_template('backend_destination_form.html', destination=None)

@app.route('/backend/destinations/edit/<dest_id>', methods=['GET', 'POST'])
def backend_destination_edit(dest_id):
    dest = db['destinations'].find_one({'_id': ObjectId(dest_id)})
    if request.method == 'POST':
        db['destinations'].update_one({'_id': ObjectId(dest_id)}, {'$set': {'name': request.form['name']}})
        flash('Destination updated.')
        return redirect(url_for('backend_destinations'))
    return render_template('backend_destination_form.html', destination=dest)

@app.route('/backend/destinations/delete/<dest_id>', methods=['POST'])
def backend_destination_delete(dest_id):
    db['destinations'].delete_one({'_id': ObjectId(dest_id)})
    flash('Destination deleted.')
    return redirect(url_for('backend_destinations'))

# --- Edit Reservation ---
from flask import abort

@app.route('/backend/reservations/edit/<reservation_id>', methods=['GET', 'POST'])
def backend_edit_reservation(reservation_id):
    check = require_admin()
    if check:
        return check
    from datetime import datetime, timedelta
    booking = bookings_col.find_one({'_id': ObjectId(reservation_id)})
    if not booking:
        abort(404)
    users = list(users_col.find({}))
    cars = list(cars_col.find({}))

    # Mark cars as available/unavailable for dropdown
    now = datetime.utcnow()
    for car in cars:
        car['available'] = True
        for b in bookings_col.find({'car_id': str(car['_id']), '_id': {'$ne': booking['_id']}}):
            # Only consider overlapping bookings that are approved or pending (not expired)
            if b.get('status') in ('approved', 'pending', 'pending_update'):
                # Expire pending/pending_update if >48h
                if b.get('status') in ('pending', 'pending_update'):
                    try:
                        req_at = datetime.strptime(b.get('requested_at', ''), '%Y-%m-%d %H:%M')
                        if (now - req_at) > timedelta(hours=48):
                            bookings_col.update_one({'_id': b['_id']}, {'$set': {'status': 'expired'}})
                            continue
                    except Exception:
                        continue
                s1, e1 = b['start_time'], b['end_time']
                s2, e2 = booking['start_time'], booking['end_time']
                # Mark unavailable if overlap with any booking except this one
                if not (booking['end_time'] <= s1 or booking['start_time'] >= e1):
                    car['available'] = False
                    break
    if request.method == 'POST':
        user_id = request.form['user_id']
        car_id = request.form['car_id']
        start_time = request.form['start_time']
        end_time = request.form['end_time']
        status = request.form['status']
        notes = request.form.get('notes', '')
        # Validate time logic
        if end_time <= start_time:
            flash('End time must be after start time.')
            return redirect(url_for('backend_edit_reservation', reservation_id=reservation_id))
        # Overlap check for car
        overlap = None
        for b in bookings_col.find({'car_id': car_id, '_id': {'$ne': booking['_id']}}):
            if b.get('status') in ('approved', 'pending', 'pending_update'):
                # Expire pending/pending_update if >48h
                if b.get('status') in ('pending', 'pending_update'):
                    try:
                        req_at = datetime.strptime(b.get('requested_at', ''), '%Y-%m-%d %H:%M')
                        if (now - req_at) > timedelta(hours=48):
                            bookings_col.update_one({'_id': b['_id']}, {'$set': {'status': 'expired'}})
                            continue
                    except Exception:
                        continue
                s1, e1 = b['start_time'], b['end_time']
                if not (end_time <= s1 or start_time >= e1):
                    overlap = b
                    break
        if overlap:
            flash('Selected car is not available for the chosen time.')
            return redirect(url_for('backend_edit_reservation', reservation_id=reservation_id))
        # Update booking
        bookings_col.update_one({'_id': booking['_id']}, {'$set': {
            'user_id': user_id,
            'car_id': car_id,
            'start_time': start_time,
            'end_time': end_time,
            'status': status,
            'notes': notes,
            'requested_at': now.strftime('%Y-%m-%d %H:%M') if status in ('pending', 'pending_update') else booking.get('requested_at','')
        }})
        flash('Reservation updated successfully.')
        return redirect(url_for('backend_customer_details', user_id=user_id))
    return render_template('backend_edit_reservation.html', booking=booking, users=users, cars=cars)

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
