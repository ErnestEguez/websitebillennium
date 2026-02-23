import requests
import sys
import json
from datetime import datetime

class BillenniumAPITester:
    def __init__(self, base_url="https://pymes-ecuador.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.user_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_credentials = {"email": "admin@billennium.com", "password": "Admin2024!"}
        self.user_credentials = {"email": "kerly@hotmail.com", "password": "kerly2026"}

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        if description:
            print(f"   Description: {description}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not dict'}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response text: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ FAILED - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test API root endpoint"""
        return self.run_test(
            "API Root",
            "GET", 
            "",
            200,
            description="Check if API is running"
        )

    def test_admin_login(self):
        """Test admin login and store token"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data=self.admin_credentials,
            description="Login with admin credentials"
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin user: {response.get('user', {}).get('name', 'Unknown')}")
            print(f"   Admin role: {response.get('user', {}).get('role', 'Unknown')}")
            return True
        return False

    def test_user_login(self):
        """Test regular user login and store token"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data=self.user_credentials,
            description="Login with regular user credentials"
        )
        if success and 'access_token' in response:
            self.user_token = response['access_token']
            print(f"   User: {response.get('user', {}).get('name', 'Unknown')}")
            print(f"   User role: {response.get('user', {}).get('role', 'Unknown')}")
            return True
        return False

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        return self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data={"email": "wrong@email.com", "password": "wrongpass"},
            description="Should fail with invalid credentials"
        )[0]

    def test_get_products(self):
        """Test get all products"""
        success, response = self.run_test(
            "Get All Products",
            "GET",
            "products",
            200,
            description="Retrieve all 6 products"
        )
        if success:
            products = response
            print(f"   Found {len(products)} products")
            expected_products = ['restoflow', 'sentinel', 'importaciones', 'lopdp', 'facturacion', 'dashboard']
            found_products = [p.get('id', '') for p in products]
            print(f"   Product IDs: {found_products}")
            return len(products) == 6
        return False

    def test_get_specific_product(self):
        """Test get specific product by ID"""
        return self.run_test(
            "Get RestoFlow Product",
            "GET",
            "products/restoflow",
            200,
            description="Get RestoFlow product details"
        )[0]

    def test_get_nonexistent_product(self):
        """Test get non-existent product"""
        return self.run_test(
            "Get Non-existent Product",
            "GET",
            "products/nonexistent",
            404,
            description="Should return 404 for invalid product"
        )[0]

    def test_auth_me_admin(self):
        """Test /auth/me endpoint with admin token"""
        if not self.admin_token:
            print("❌ Skipping - No admin token available")
            return False
        
        return self.run_test(
            "Auth Me (Admin)",
            "GET",
            "auth/me",
            200,
            token=self.admin_token,
            description="Get current admin user info"
        )[0]

    def test_auth_me_user(self):
        """Test /auth/me endpoint with user token"""
        if not self.user_token:
            print("❌ Skipping - No user token available")
            return False
            
        return self.run_test(
            "Auth Me (User)",
            "GET",
            "auth/me",
            200,
            token=self.user_token,
            description="Get current user info"
        )[0]

    def test_contact_form(self):
        """Test contact form submission"""
        contact_data = {
            "name": "Test Contact",
            "email": "test@example.com",
            "phone": "0987654321",
            "company": "Test Company",
            "message": "This is a test message",
            "product_interest": "RestoFlow"
        }
        
        return self.run_test(
            "Submit Contact Form",
            "POST",
            "contact",
            200,
            data=contact_data,
            description="Submit contact form message"
        )[0]

    def test_register_new_user(self):
        """Test user registration"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        user_data = {
            "email": f"testuser_{timestamp}@example.com",
            "name": "Test User",
            "company_name": "Test Company",
            "phone": "0987654321",
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "Register New User",
            "POST",
            "auth/register",
            200,
            data=user_data,
            description="Register a new user account"
        )
        return success

    def test_create_subscription(self):
        """Test creating a subscription (requires user token)"""
        if not self.user_token:
            print("❌ Skipping - No user token available")
            return False
            
        subscription_data = {
            "product_id": "restoflow",
            "plan_name": "Emprendedor",
            "billing_cycle": "monthly"
        }
        
        return self.run_test(
            "Create Subscription",
            "POST",
            "subscriptions",
            200,
            data=subscription_data,
            token=self.user_token,
            description="Create subscription request"
        )[0]

    def test_get_user_subscriptions(self):
        """Test getting user's subscriptions"""
        if not self.user_token:
            print("❌ Skipping - No user token available")
            return False
            
        return self.run_test(
            "Get My Subscriptions",
            "GET",
            "subscriptions/my",
            200,
            token=self.user_token,
            description="Get current user's subscriptions"
        )[0]

    def test_admin_stats(self):
        """Test admin stats endpoint"""
        if not self.admin_token:
            print("❌ Skipping - No admin token available")
            return False
            
        success, response = self.run_test(
            "Admin Stats",
            "GET",
            "admin/stats",
            200,
            token=self.admin_token,
            description="Get admin dashboard statistics"
        )
        if success:
            stats = response
            expected_keys = ['total_users', 'total_subscriptions', 'active_subscriptions', 'pending_subscriptions']
            found_keys = list(stats.keys())
            print(f"   Stats keys: {found_keys}")
            return all(key in stats for key in expected_keys)
        return False

    def test_admin_get_subscriptions(self):
        """Test admin get all subscriptions"""
        if not self.admin_token:
            print("❌ Skipping - No admin token available") 
            return False
            
        return self.run_test(
            "Admin Get All Subscriptions",
            "GET",
            "admin/subscriptions",
            200,
            token=self.admin_token,
            description="Get all subscriptions (admin only)"
        )[0]

    def test_admin_get_messages(self):
        """Test admin get contact messages"""
        if not self.admin_token:
            print("❌ Skipping - No admin token available")
            return False
            
        return self.run_test(
            "Admin Get Messages",
            "GET",
            "admin/messages",
            200,
            token=self.admin_token,
            description="Get all contact messages (admin only)"
        )[0]

    def test_unauthorized_access(self):
        """Test accessing admin endpoint without token"""
        return self.run_test(
            "Unauthorized Admin Access",
            "GET",
            "admin/stats",
            401,
            description="Should fail without authentication"
        )[0]

    def test_user_cannot_access_admin(self):
        """Test that regular user cannot access admin endpoints"""
        if not self.user_token:
            print("❌ Skipping - No user token available")
            return False
            
        return self.run_test(
            "User Cannot Access Admin",
            "GET",
            "admin/stats",
            403,
            token=self.user_token,
            description="Regular user should be denied admin access"
        )[0]

def main():
    print("🚀 Starting Billennium System API Tests")
    print("=" * 60)
    
    tester = BillenniumAPITester()
    
    # Basic API tests
    tester.test_root_endpoint()
    tester.test_get_products()
    tester.test_get_specific_product()
    tester.test_get_nonexistent_product()
    
    # Authentication tests
    tester.test_admin_login()
    tester.test_user_login()
    tester.test_invalid_login()
    
    # User info tests (require login tokens)
    tester.test_auth_me_admin()
    tester.test_auth_me_user()
    
    # Contact form test
    tester.test_contact_form()
    
    # User registration test
    tester.test_register_new_user()
    
    # Subscription tests
    tester.test_create_subscription()
    tester.test_get_user_subscriptions()
    
    # Admin-only tests
    tester.test_admin_stats()
    tester.test_admin_get_subscriptions()
    tester.test_admin_get_messages()
    
    # Security tests
    tester.test_unauthorized_access()
    tester.test_user_cannot_access_admin()
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())