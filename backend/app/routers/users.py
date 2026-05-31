from fastapi import APIRouter

# Создаем экземпляр роутера.
# prefix="/users" — это пространство имен. Все маршруты в этом файле
# автоматически получат этот префикс.
# tags=["Users"] — нужно для группировки в автоматической документации (Swagger UI).
router = APIRouter(prefix="/users", tags=["Users"])

# ВАЖНО: Мы используем декоратор @router, а не @app.
# Переменной app здесь не существует, мы находимся в изолированном модуле.


@router.get("/")
def get_users() -> list[dict]:
    # Итоговый путь будет: GET /users/
    # Нам не нужно писать "/users" руками, префикс подставится сам.
    return [{"username": "Rick"}, {"username": "Morty"}]


@router.get("/me")
def get_current_user() -> dict:
    return {"username": "Rick", "role": "admin"}
