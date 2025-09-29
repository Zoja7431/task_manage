# TaskFlow - Минималистичный таск-менеджер

Простой и удобный планировщик задач на чистом HTML, CSS и JavaScript.

## Особенности
*   Создание, редактирование и удаление задач
*   Фильтрация по статусу, приоритету и тегам
*   Локальное сохранение данных (localStorage)
*   Адаптивный дизайн для мобильных устройств

## Структура проекта
task-manager/
├── index.js              // Главный серверный файл (Express)
├── models/               // Модели Sequelize
│   ├── User.js
│   ├── Task.js
│   ├── Tag.js
│   └── index.js          // Настройка Sequelize
├── routes/               // Маршруты
│   ├── home.js
│   ├── auth.js
│   └── weekly.js
├── views/                // EJS шаблоны
│   ├── base.ejs
│   ├── home.ejs
│   ├── register.ejs
│   ├── login.ejs
│   ├── profile.ejs
│   └── weekly.ejs
├── public/               // Статические файлы
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── scripts.js
├── package.json          // Зависимости и скрипты
├── .gitignore            // Игнорируемые файлы
├── Procfile              // Для Heroku
└── README.md             // Документация для вуза

**Задеплойено на Netlify:** (https://transcendent-madeleine-55431a.netlify.app)
