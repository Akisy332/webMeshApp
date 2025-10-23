"""
Constants for user permissions across all services
"""

from enum import Enum

class Permissions(str, Enum):
    # Public permissions (for unauthenticated users)
    READ_PUBLIC = "read_public"
    
    # Basic user permissions
    READ = "read"
    WRITE = "write"
    
    # Sessions moderation permissions
    MODERATE = "moderate"
    CREATE_SESSION = "create_session"
    DELETE_SESSION = "delete_session"
    UPDATE_SESSION = "update_session"
    
    # User management permissions
    MANAGE_USERS = "manage_users"
    VIEW_USERS = "view_users"
    BAN_USERS = "ban_users"
    
    # Administrative permissions
    ADMIN = "admin"
    VIEW_ANALYTICS = "view_analytics"
    SYSTEM_CONFIG = "system_config"
    MANAGE_SETTINGS = "manage_settings"
    
    # Developer permissions
    DEVELOPER = "developer"
    DEBUG = "debug"
    API_MANAGEMENT = "api_management"
    VIEW_LOGS = "view_logs"

# Permission groups for roles
ROLE_PERMISSIONS = {
    "public": [
        Permissions.READ_PUBLIC
    ],
    "user": [
        Permissions.READ_PUBLIC,
        Permissions.READ,
        Permissions.WRITE
    ],
    "curator": [
        Permissions.READ_PUBLIC,
        Permissions.READ,
        Permissions.WRITE,
        Permissions.MODERATE,
        Permissions.CREATE_SESSION,
        Permissions.DELETE_SESSION,
        Permissions.UPDATE_SESSION
    ],
    "admin": [
        Permissions.READ_PUBLIC,
        Permissions.READ,
        Permissions.WRITE,
        Permissions.MODERATE,
        Permissions.CREATE_SESSION,
        Permissions.DELETE_SESSION,
        Permissions.UPDATE_SESSION,
        Permissions.MANAGE_USERS,
        Permissions.VIEW_USERS,
        Permissions.BAN_USERS,
        Permissions.ADMIN,
        Permissions.VIEW_ANALYTICS,
        Permissions.SYSTEM_CONFIG,
        Permissions.MANAGE_SETTINGS
    ],
    "developer": [
        Permissions.READ_PUBLIC,
        Permissions.READ,
        Permissions.WRITE,
        Permissions.MODERATE,
        Permissions.CREATE_SESSION,
        Permissions.DELETE_SESSION,
        Permissions.UPDATE_SESSION,
        Permissions.MANAGE_USERS,
        Permissions.VIEW_USERS,
        Permissions.BAN_USERS,
        Permissions.ADMIN,
        Permissions.VIEW_ANALYTICS,
        Permissions.SYSTEM_CONFIG,
        Permissions.MANAGE_SETTINGS,
        Permissions.DEVELOPER,
        Permissions.DEBUG,
        Permissions.API_MANAGEMENT,
        Permissions.VIEW_LOGS
    ]
}

def get_permissions_for_role(role: str) -> list[Permissions]:
    """Get permissions for a specific role"""
    return ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["public"])

def has_permission(user_permissions: list[str], required_permission: Permissions) -> bool:
    """Check if user has required permission"""
    return required_permission.value in user_permissions

def has_any_permission(user_permissions: list[str], required_permissions: list[Permissions]) -> bool:
    """Check if user has any of the required permissions"""
    user_perms_set = set(user_permissions)
    return any(perm.value in user_perms_set for perm in required_permissions)

def has_all_permissions(user_permissions: list[str], required_permissions: list[Permissions]) -> bool:
    """Check if user has all required permissions"""
    user_perms_set = set(user_permissions)
    return all(perm.value in user_perms_set for perm in required_permissions)