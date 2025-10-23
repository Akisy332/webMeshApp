from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime
import re
import logging
from enum import Enum

logger = logging.getLogger("user-models")

class UserRole(str, Enum):
    PUBLIC = "public"
    USER = "user"
    CURATOR = "curator"
    ADMIN = "admin"
    DEVELOPER = "developer"

class UserBase(BaseModel):
    email: EmailStr
    username: str
    role: UserRole = UserRole.USER

    @validator('username')
    def validate_username(cls, v):
        try:
            if len(v) < 3:
                raise ValueError('Username must be at least 3 characters long')
            if len(v) > 50:
                raise ValueError('Username must be less than 50 characters')
            if not re.match(r'^[a-zA-Z0-9_]+$', v):
                raise ValueError('Username can only contain letters, numbers and underscores')
            return v
        except Exception as e:
            logger.warning(f"Username validation failed: {str(e)}")
            raise

class UserCreate(UserBase):
    password: str

    @validator('password')
    def validate_password(cls, v):
        try:
            if len(v) < 8:
                raise ValueError('Password must be at least 8 characters long')
            if not any(char.isdigit() for char in v):
                raise ValueError('Password must contain at least one digit')
            if not any(char.isupper() for char in v):
                raise ValueError('Password must contain at least one uppercase letter')
            return v
        except Exception as e:
            logger.warning(f"Password validation failed: {str(e)}")
            raise

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class RoleUpdateRequest(BaseModel):
    role: UserRole