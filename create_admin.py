#!/usr/bin/env python3
"""
Скрипт для создания администратора через публичный эндпоинт
"""

import requests
import sys
import os

def create_admin_via_api():
    """Создание администратора через API"""
    user_service_url = "http://localhost:8004"
    
    admin_user = {
        "email": "admin@example.com",
        "username": "admin", 
        "password": "Admin123!",
        "role": "admin"
    }
    
    try:
        print("👤 Creating admin user via API...")
        
        # Пробуем через публичный эндпоинт
        response = requests.post(
            f"{user_service_url}/init-first-admin", 
            json=admin_user, 
            timeout=10
        )
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"Admin user created successfully via API!")
            print(f"   Username: {user_data['user']['username']}")
            print(f"   Email: {user_data['user']['email']}")
            print(f"   Role: {user_data['user']['role']}")
            return True
        elif response.status_code == 400:
            error_detail = response.json().get('detail', '')
            if 'already exists' in error_detail:
                print(" Admin user already exists in system")
                return True
            else:
                print(f"API Error: {error_detail}")
                return False
        else:
            print(f"API returned status: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"API call failed: {e}")
        return False

def main():
    """Основная функция"""
    print(" Admin User Creation")
    print("=" * 40)
    
    # пробуем через API
    create_admin_via_api()
    
    print("Failed to create admin user")
    sys.exit(1)

if __name__ == "__main__":
    main()