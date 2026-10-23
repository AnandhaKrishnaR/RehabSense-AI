import os
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file from project root or backend dir
env_path = BASE_DIR.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('SECRET_KEY', 'rehabsense-hackathon-insecure-dev-key-change-in-production')
DEBUG = os.getenv('DEBUG', 'True').lower() in ('true', '1', 't')

ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,*').split(',') if host.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party apps
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    # RehabSense Domain Apps
    'apps.rehabilitation',
    'apps.movement',
    'apps.voice',
    'apps.safety',
    'apps.reporting',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database Configuration (Defaults to SQLite; supports PostgreSQL via DATABASE_URL)
DATABASE_URL = os.getenv('DATABASE_URL', '')
if DATABASE_URL and (DATABASE_URL.startswith('postgres://') or DATABASE_URL.startswith('postgresql://')):
    parsed_db = urlparse(DATABASE_URL)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed_db.path[1:],
            'USER': parsed_db.username or '',
            'PASSWORD': parsed_db.password or '',
            'HOST': parsed_db.hostname or 'localhost',
            'PORT': parsed_db.port or 5432,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS configuration
cors_origins_env = os.getenv('CORS_ALLOWED_ORIGINS', '')
if cors_origins_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_origins_env.split(',') if o.strip()]
    CORS_ALLOW_ALL_ORIGINS = os.getenv('CORS_ALLOW_ALL_ORIGINS', 'False').lower() in ('true', '1', 't')
else:
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'EXCEPTION_HANDLER': 'config.exceptions.custom_exception_handler',
}

# Maximum audio upload size (10 MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# RehabSense App Settings
DEMO_MODE = os.getenv('DEMO_MODE', 'True').lower() in ('true', '1', 't')
MALAYALAM_VOICE_PROVIDER = os.getenv('MALAYALAM_VOICE_PROVIDER', 'sarvam')
TTS_PROVIDER = os.getenv('TTS_PROVIDER', os.getenv('MALAYALAM_TTS_PROVIDER', 'gemini'))
MALAYALAM_TTS_PROVIDER = TTS_PROVIDER

# Sarvam AI Malayalam Voice Configuration
SARVAM_API_KEY = os.getenv('SARVAM_API_KEY', '')
SARVAM_STT_MODEL = os.getenv('SARVAM_STT_MODEL', 'saaras:v3')
SARVAM_TTS_MODEL = os.getenv('SARVAM_TTS_MODEL', 'bulbul:v3')
SARVAM_TTS_SPEAKER = os.getenv('SARVAM_TTS_SPEAKER', 'shubh')
SARVAM_LANGUAGE_CODE = os.getenv('SARVAM_LANGUAGE_CODE', 'ml-IN')
SARVAM_TIMEOUT_SECONDS = float(os.getenv('SARVAM_TIMEOUT_SECONDS', '15.0'))
SARVAM_TTS_PACE = float(os.getenv('SARVAM_TTS_PACE', '1.0'))
SARVAM_TTS_SAMPLE_RATE = int(os.getenv('SARVAM_TTS_SAMPLE_RATE', '22050'))
SARVAM_TTS_DICT_ID = os.getenv('SARVAM_TTS_DICT_ID', '')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_TTS_MODEL = os.getenv('GEMINI_TTS_MODEL', 'gemini-3.8-flash-tts')
GEMINI_TTS_VOICE = os.getenv('GEMINI_TTS_VOICE', 'Kore')
GEMINI_TTS_TIMEOUT_SECONDS = float(os.getenv('GEMINI_TTS_TIMEOUT_SECONDS', '30.0'))
VOICE_MAX_UPLOAD_SIZE = int(os.getenv('VOICE_MAX_UPLOAD_SIZE', str(10 * 1024 * 1024)))
VOICE_CACHE_ENABLED = os.getenv('VOICE_CACHE_ENABLED', 'True').lower() in ('true', '1', 't')

