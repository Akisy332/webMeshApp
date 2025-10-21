#!/usr/bin/env python3
import requests
import json
import sys

# Конфигурация
BASE_URL = "http://localhost:8000"  # API Gateway
AUTH_URL = f"{BASE_URL}/auth"

def test_authentication_flow():
    """Тестирование полного цикла аутентификации"""
    print("🔐 Testing Authentication Flow\n")
    
    # 1. Регистрация нового пользователя
    print("1. Testing user registration...")
    register_data = {
        "email": "test@example.com",
        "username": "testuser",
        "password": "TestPassword123"
    }
    
    try:
        response = requests.post(f"{AUTH_URL}/register", json=register_data)
        if response.status_code == 200:
            print("✅ Registration successful")
            user_data = response.json()
            print(f"   User ID: {user_data['id']}, Username: {user_data['username']}")
        elif response.status_code == 400:
            print("ℹ️  User already exists, continuing...")
        else:
            print(f"❌ Registration failed: {response.status_code} - {response.text}")
            return
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return
    
    # 2. Логин
    print("\n2. Testing login...")
    login_data = {
        "username": "testuser",
        "password": "TestPassword123"
    }
    
    try:
        response = requests.post(f"{AUTH_URL}/login", json=login_data)
        if response.status_code == 200:
            print("✅ Login successful")
            tokens = response.json()
            access_token = tokens['access_token']
            refresh_token = tokens['refresh_token']
            print(f"   Access Token: {access_token[:50]}...")
            print(f"   Refresh Token: {refresh_token[:50]}...")
            print(f"   Expires in: {tokens['expires_in']} seconds")
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return
    except Exception as e:
        print(f"❌ Login error: {e}")
        return
    
    # 3. Доступ к защищенному API
    print("\n3. Testing protected API access...")
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/api/sessions", headers=headers)
        if response.status_code == 200:
            print("✅ Protected API access successful")
            sessions = response.json()
            print(f"   Retrieved {len(sessions)} sessions")
        else:
            print(f"❌ Protected API access failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Protected API error: {e}")
    
    # 4. Проверка текущего пользователя
    print("\n4. Testing current user endpoint...")
    try:
        response = requests.get(f"{AUTH_URL}/me", headers=headers)
        if response.status_code == 200:
            user_info = response.json()
            print("✅ Current user endpoint successful")
            print(f"   User: {user_info['username']} (ID: {user_info['id']})")
        else:
            print(f"❌ Current user endpoint failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Current user error: {e}")
    
    # 5. Обновление токенов
    print("\n5. Testing token refresh...")
    refresh_data = {"refresh_token": refresh_token}
    
    try:
        response = requests.post(f"{AUTH_URL}/refresh", json=refresh_data)
        if response.status_code == 200:
            print("✅ Token refresh successful")
            new_tokens = response.json()
            new_access_token = new_tokens['access_token']
            new_refresh_token = new_tokens['refresh_token']
            print(f"   New Access Token: {new_access_token[:50]}...")
            print(f"   New Refresh Token: {new_refresh_token[:50]}...")
            
            # Обновляем токены для следующих запросов
            access_token = new_access_token
            refresh_token = new_refresh_token
            headers = {"Authorization": f"Bearer {access_token}"}
        else:
            print(f"❌ Token refresh failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Token refresh error: {e}")
    
    # 6. Выход
    print("\n6. Testing logout...")
    logout_data = {"refresh_token": refresh_token}
    
    try:
        response = requests.post(f"{AUTH_URL}/logout", json=logout_data, headers=headers)
        if response.status_code == 200:
            print("✅ Logout successful")
        else:
            print(f"❌ Logout failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Logout error: {e}")
    
    # 7. Проверка service discovery
    print("\n7. Testing service discovery...")
    try:
        response = requests.get(f"{BASE_URL}/services")
        if response.status_code == 200:
            services = response.json()
            print("✅ Service discovery successful")
            for service, info in services.items():
                print(f"   {service}: {info['status']} (response: {info['response_time']}s)")
        else:
            print(f"❌ Service discovery failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Service discovery error: {e}")
    
    print("\n🎉 Authentication flow test completed!")

if __name__ == "__main__":
    test_authentication_flow()