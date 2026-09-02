from datetime import datetime, timedelta
from bson import ObjectId

def get_applicable_rate(car_id, start_dt, end_dt, standard_rates, special_rates):
    """
    Returns (hourly_rate, daily_cap, source) for the given car and datetime range.
    - Checks for special rate for car in the period.
    - Falls back to car's standard rate.
    - Falls back to global standard rate.
    """
    # Check for special rate (car-specific or global)
    for rate in special_rates:
        if ((rate['car_id'] == str(car_id)) or (rate['car_id'] == 'global')) and \
           (rate['start_date'] <= start_dt.date().isoformat()) and \
           (rate['end_date'] >= end_dt.date().isoformat()):
            return rate['hourly_rate'], rate['daily_cap'], 'special'
    # Car-specific standard rate
    if str(car_id) in standard_rates:
        rate = standard_rates[str(car_id)]
        return rate['hourly_rate'], rate['daily_cap'], 'standard'
    # Global standard rate
    if 'global' in standard_rates:
        rate = standard_rates['global']
        return rate['hourly_rate'], rate['daily_cap'], 'global'
    return None, None, None

import math

def calculate_price(start_time, end_time, hourly_rate, daily_cap):
    """
    Calculates price given start/end datetimes and pricing plan.
    """
    delta = end_time - start_time
    total_hours = delta.total_seconds() / 3600
    days = int(total_hours // 24)
    hours = total_hours % 24
    hours = int(math.ceil(hours))
    price = days * daily_cap + min(hours * hourly_rate, daily_cap)
    return round(price, 2), days, hours
