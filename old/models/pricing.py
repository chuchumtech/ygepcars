# Pricing models for car rental
from bson import ObjectId

def standard_rate_doc(car_id, hourly_rate, daily_cap):
    return {
        'car_id': car_id,  # ObjectId or 'global'
        'hourly_rate': hourly_rate,
        'daily_cap': daily_cap,
    }

def special_rate_doc(car_id, start_date, end_date, hourly_rate, daily_cap):
    return {
        'car_id': car_id,  # ObjectId or 'global'
        'start_date': start_date,  # 'YYYY-MM-DD'
        'end_date': end_date,      # 'YYYY-MM-DD'
        'hourly_rate': hourly_rate,
        'daily_cap': daily_cap,
    }
