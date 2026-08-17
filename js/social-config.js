/* ============================================================
   NEXORA — НАСТРОЙКА ВХОДА ЧЕРЕЗ СОЦСЕТИ
   ============================================================
   Впиши сюда свои ключи — и кнопки «Telegram / Google»
   в модалках входа и регистрации заработают.

   Как получить ключи:
   • Telegram  → в Telegram найди @BotFather → /newbot → имя и
                 юзернейм бота. Получишь токен. Нажми Start у бота.
                 botName = юзернейм без @, botToken = токен.
   • Google    → console.cloud.google.com → APIs & Services →
                 Credentials → OAuth client ID → Web application.
                 clientId = твой Client ID.
   ============================================================ */

window.NEXORA_SOCIAL_CONFIG = {
    telegram: {
        enabled: true,
        botName: 'Nexora1s_bot',          // ← юзернейм бота БЕЗ @
        botToken: '8835168766:AAFSVqB4nmdhXaOR4MTZMYaz_LHH8j2haKk'          // ← токен от @BotFather
    },
    google: {
        enabled: true,
        clientId: '961867421954-g2f1ltqnood58jgbd7g8dq59k50uhiie.apps.googleusercontent.com'          // ← Client ID из Google Cloud Console
    }
};
