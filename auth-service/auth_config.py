import yaml
import time
import threading
import logging
from pathlib import Path
from typing import Dict, Set, List

logger = logging.getLogger("auth-config")

class AuthConfig:
    def __init__(self, config_path: str = "auth_rules.yml"):
        self.config_path = Path(config_path)
        self._compiled_data = {}
        self._last_modified = 0
        self._lock = threading.RLock()
        
        # Иерархия ролей
        self.ROLE_HIERARCHY = {
            "developer": 4,
            "admin": 3, 
            "curator": 2,
            "user": 1,
            "public": 0
        }
        
        self._load_and_compile()
        self._start_watcher()
    
    def _load_and_compile(self):
        """Загрузка и компиляция YAML в оптимизированные структуры"""
        with self._lock:
            try:
                if not self.config_path.exists():
                    logger.error(f"Config file not found: {self.config_path}")
                    return
                
                current_modified = self.config_path.stat().st_mtime
                if current_modified <= self._last_modified:
                    logger.info("Auth config not modified")
                    return
                
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    raw_config = yaml.safe_load(f)
                
                self._compiled_data = self._compile_rules(raw_config)
                self._last_modified = current_modified
                logger.info("Auth config reloaded and compiled")
                
            except Exception as e:
                logger.error(f"Error loading auth config: {e}")
    
    def _compile_rules(self, raw_config: Dict) -> Dict:
        """Трансформация YAML в оптимизированные структуры данных"""
        compiled = {}
        
        # Компиляция всех ролей
        role_minimum_access = {}
        for role, rules in raw_config.get('role_minimum_access', {}).items():
            role_rules = {}
            for rule in rules:
                path = rule['path']
                methods = set(rule['methods'])
                role_rules[path] = methods
            role_minimum_access[role] = role_rules
        
        compiled['role_minimum_access'] = role_minimum_access
        
        return compiled
    
    def _start_watcher(self):
        """Фоновая проверка изменений конфига"""
        def watch_loop():
            while True:
                time.sleep(30)
                self._load_and_compile()
        
        watcher_thread = threading.Thread(target=watch_loop, daemon=True)
        watcher_thread.start()
    
    def has_role_access(self, user_role: str, required_role: str) -> bool:
        """Проверка что user_role >= required_role в иерархии"""
        user_level = self.ROLE_HIERARCHY.get(user_role, 0)
        required_level = self.ROLE_HIERARCHY.get(required_role, 0)
        return user_level >= required_level
    
    def is_public_endpoint(self, method: str, path: str) -> bool:
        """Проверка публичного эндпоинта через роль public"""
        return self.can_access("public", method, path)
    
    def can_access(self, role: str, method: str, path: str) -> bool:
        """Проверка доступа с учетом иерархии ролей"""
        # Админы и разработчики имеют доступ ко всему
        if role in ["admin", "developer"]:
            return True
        
        # Получаем агрегированные права для роли
        role_access = self._get_aggregated_access(role)
        
        # Проверка доступа
        for rule_path, allowed_methods in role_access.items():
            if path.startswith(rule_path) and method in allowed_methods:
                return True
        
        # Логирование неизвестных endpoints
        logger.warning(f"No access rules for {role} to {method} {path}")
        return False
    
    def _get_aggregated_access(self, role: str) -> Dict[str, Set]:
        """Получить ВСЕ права для роли (с наследованием иерархии)"""
        aggregated = {}
        user_level = self.ROLE_HIERARCHY.get(role, 0)
        
        for min_role, rules in self._compiled_data.get('role_minimum_access', {}).items():
            min_level = self.ROLE_HIERARCHY.get(min_role, 0)
            
            # Если роль пользователя >= минимальной роли для права
            if user_level >= min_level:
                for path, methods in rules.items():
                    # Объединяем методы для этого пути
                    if path in aggregated:
                        aggregated[path].update(methods)
                    else:
                        aggregated[path] = methods.copy()
        
        return aggregated
    
    def force_reload(self):
        """Принудительная перезагрузка конфига"""
        self._load_and_compile()
    
    def get_stats(self):
        """Статистика загруженных правил"""
        role_count = len(self._compiled_data.get('role_minimum_access', {}))
        
        # Подсчет агрегированных прав для каждой роли
        role_access_stats = {}
        for role in self.ROLE_HIERARCHY.keys():
            aggregated = self._get_aggregated_access(role)
            role_access_stats[role] = {
                'paths': len(aggregated),
                'total_methods': sum(len(methods) for methods in aggregated.values())
            }
        
        return {
            'roles_defined': role_count,
            'role_hierarchy': self.ROLE_HIERARCHY,
            'role_access_stats': role_access_stats,
            'last_modified': self._last_modified
        }