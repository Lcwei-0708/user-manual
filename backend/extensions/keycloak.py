import re
import logging
from functools import wraps
from core.config import settings
from fastapi import HTTPException
from typing import Optional, List, Union
from keycloak import KeycloakAdmin, KeycloakOpenID

class KeycloakExtension:
    def __init__(self):
        # keycloak config
        self.server_url = settings.KEYCLOAK_SERVER_URL
        self.realm_name = settings.KEYCLOAK_REALM
        self.client_id = settings.KEYCLOAK_ADMIN_CLIENT
        self.client_secret_key = settings.KEYCLOAK_ADMIN_CLIENT_SECRET
        self.verify = settings.KEYCLOAK_VERIFY
        # keycloak admin
        self.keycloak_admin = KeycloakAdmin(
            server_url=self.server_url,
            realm_name=self.realm_name,
            client_id=self.client_id,
            client_secret_key=self.client_secret_key,
            verify=self.verify
        )
        # keycloak openid
        self.keycloak_openid = KeycloakOpenID(
            server_url=self.server_url,
            realm_name=self.realm_name,
            client_id=self.client_id,
            client_secret_key=self.client_secret_key,
            verify=self.verify
        )

    def require_permission(self, required_roles: Union[str, List[str]]):        
        """
        User needs to have at least one of the required roles.
        """
        # Convert single string to list for consistent handling
        if isinstance(required_roles, str):
            required_roles = [required_roles]
        
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                token = kwargs.get("token")
                if not token:
                    raise HTTPException(status_code=401)
                user_id = await self.get_user_id(token)
                if not user_id:
                    raise HTTPException(status_code=401)

                # Get user's realm roles
                user_roles = await self.keycloak_admin.a_get_realm_roles_of_user(user_id)
                user_role_names = [role["name"] for role in user_roles]

                # Check if user has super role - if yes, grant all permissions
                if settings.KEYCLOAK_SUPER_ROLE in user_role_names:
                    return await func(*args, **kwargs)

                # Check if user has any of the required roles (role-based only, no attributes)
                if any(role in user_role_names for role in required_roles):
                    return await func(*args, **kwargs)

                raise HTTPException(status_code=403)
            return wrapper
        return decorator
    
    async def verify_token(self, token: str):
        logger = logging.getLogger("keycloak_verify")
        try:
            userinfo = await self.keycloak_openid.a_userinfo(token)
            if userinfo:
                return True
            return False
        except Exception as e:
            logger.error(f"verify token error: {e}")
            return False

    async def get_user_id(self, token: str):
        try:
            userinfo = await self.keycloak_openid.a_userinfo(token)
            if userinfo:
                return userinfo.get("sub")
            return None
        except Exception:
            return None
    
    def is_custom_role(self, role_name):
        default_roles = [
            "two-shoulder", "offline_access", "uma_authorization"
        ]
        if role_name.startswith("default-roles-"):
            return False
        if role_name in default_roles:
            return False
        return True

    def parse_attributes(self, attributes: dict) -> dict:
        """
        Convert {"admin": ["true"], "other": ["false"]} to {"admin": True, "other": False}
        """
        result = {}
        for k, v in (attributes or {}).items():
            if isinstance(v, list) and v:
                val = v[0]
            else:
                val = v
            if isinstance(val, str) and val.lower() in ("true", "false"):
                result[k] = val.lower() == "true"
            else:
                result[k] = val
        return result

    def format_attributes(self, attributes: dict) -> dict:
        """
        Convert {"admin": True, "other": False} to {"admin": ["true"], "other": ["false"]}
        """
        result = {}
        for k, v in (attributes or {}).items():
            if isinstance(v, bool):
                result[k] = [str(v).lower()]
            else:
                result[k] = [str(v)]
        return result

    def extract_status_code_from_error(self, error_str: str) -> Optional[int]:
        """Extract HTTP status code from Keycloak error message"""
        match = re.search(r'(\d{3}):', error_str)
        if match:
            return int(match.group(1))
        return None

    def is_keycloak_404_error(self, error_str: str) -> bool:
        """Check if the error is a Keycloak 404 error"""
        status_code = self.extract_status_code_from_error(error_str)
        return status_code == 404

    def is_keycloak_409_error(self, error_str: str) -> bool:
        """Check if the error is a Keycloak 409 error (conflict)"""
        status_code = self.extract_status_code_from_error(error_str)
        return status_code == 409

_KEYCLOAK_EXTENSION: Optional[KeycloakExtension] = None

def get_keycloak() -> KeycloakExtension:
    global _KEYCLOAK_EXTENSION
    if _KEYCLOAK_EXTENSION is None:
        _KEYCLOAK_EXTENSION = KeycloakExtension()
    return _KEYCLOAK_EXTENSION

def add_keycloak(app):
    """
    Register keycloak to app.state
    """
    keycloak_ext = get_keycloak()
    app.state.keycloak = keycloak_ext.keycloak_admin