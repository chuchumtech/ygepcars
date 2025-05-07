# Minimal Flask app for YGEP Car Rental
from flask import Flask, render_template, request, redirect, url_for, session, flash
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'replace_this_with_a_secret_key'
DB_PATH = 'car_rental.db'

@app.context_processor
def inject_now():
    return {'now': datetime.now()}

# --- Database Setup ---
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            car_id INTEGER,
            start_time TEXT,
            end_time TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS cars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            year INTEGER NOT NULL,
            color TEXT NOT NULL,
            image TEXT NOT NULL
        )''')
        # Insert cars if not already present
        c.execute('SELECT COUNT(*) FROM cars')
        if c.fetchone()[0] == 0:
            c.execute('''INSERT INTO cars (name, year, color, image) VALUES (?, ?, ?, ?)''',
                      ('2023 Subaru Legacy', 2023, 'Blue', 'subaru_legacy_blue.jpg'))
            c.execute('''INSERT INTO cars (name, year, color, image) VALUES (?, ?, ?, ?)''',
                      ('2024 Toyota Corolla', 2024, 'White', 'toyota_corolla_white.jpg'))
        conn.commit()

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
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            for car in CARS:
                # Check if car is available for the selected range
                c.execute('''SELECT 1 FROM bookings WHERE car_id=? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))''',
                          (car['id'], end_time, start_time, start_time, end_time, start_time, end_time))
                available = c.fetchone() is None
                cars.append({**car, 'available': available})
        # Format user-friendly date strings
        from datetime import datetime
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
    from datetime import datetime
    # Get info from session
    car_id = session.get('reserve_car_id')
    start_time = session.get('reserve_start_time')
    end_time = session.get('reserve_end_time')
    if not car_id or not start_time or not end_time:
        flash('Reservation info missing. Please search again.')
        return redirect(url_for('index'))
    # Get car info
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('SELECT id, name, year, color, image FROM cars WHERE id=?', (car_id,))
        row = c.fetchone()
        if not row:
            flash('Car not found.')
            return redirect(url_for('index'))
        car = {'id': row[0], 'name': row[1], 'year': row[2], 'color': row[3], 'image': row[4]}
    # Get user info from session
    user = {
        'name': session.get('username', ''),
        'email': session.get('email', ''),
        'phone': session.get('phone', '')
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
        # Here you would save the reservation request for admin approval
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
        username = request.form['username']
        password = request.form['password']
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            try:
                c.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
                conn.commit()
                flash('Registration successful. Please log in.')
                return redirect(url_for('login'))
            except sqlite3.IntegrityError:
                flash('Username already taken.')
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('SELECT id FROM users WHERE username=? AND password=?', (username, password))
            user = c.fetchone()
            if user:
                session['user_id'] = user[0]
                session['username'] = username
                # If there was a pending booking, complete it now
                pending = session.pop('pending_booking', None)
                if pending:
                    return redirect(url_for('reserve_after_login'))
                return redirect(url_for('calendar'))
            else:
                flash('Invalid credentials.')
    return render_template('login.html')

@app.route('/reserve_after_login')
def reserve_after_login():
    pending = session.pop('pending_booking', None)
    if not pending:
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
        if c.fetchone():
            flash('Car is no longer available for this time.')
            return redirect(url_for('search', start_time=start_time, end_time=end_time))
        # Otherwise, book
        c.execute('INSERT INTO bookings (user_id, car_id, start_time, end_time) VALUES (?, ?, ?, ?)',
                  (user_id, car_id, start_time, end_time))
        conn.commit()
        flash('Booking successful!')
    return redirect(url_for('calendar'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/calendar')
def calendar():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    #    from datetime import datetime
    def friendly(dt_str):
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return dt.strftime("%A, %B %-d, %Y at %-I:%M %p")
        except Exception:
            return dt_str
    bookings = c.execute('''
        SELECT b.id, u.username, c.name, b.start_time, b.end_time
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN cars c ON b.car_id = c.id
        ORDER BY b.start_time DESC''').fetchall()
    bookings_friendly = []
    for b in bookings:
        b = list(b)
        b.append(friendly(b[3]))
        b.append(friendly(b[4]))
        bookings_friendly.append(b)
    return render_template('calendar.html', bookings=bookings_friendly, username=session.get('username'))

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

init_db()

if __name__ == '__main__':
    app.run(debug=True)
