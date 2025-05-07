# YGEP Car Rental MVP

Minimal car rental web app for Yeshiva Gedolah of Elkins Park students.

- Built with Flask (Python) and SQLite
- Students must register/login to book
- Two cars, first-come, first-served
- Calendar view for bookings
- Simple UI, styled like ygep.org

## Setup

1. Install requirements:
   ```bash
   pip install flask
   ```
2. Run the app:
   ```bash
   python app.py
   ```

## Notes
- All data is stored in `car_rental.db` (auto-created)
- No external libraries or frameworks (per KIMF rules)
