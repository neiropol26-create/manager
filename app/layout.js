import "./globals.css";
import BugLink from "../components/BugLink";

export const metadata = {
  title: "Управляющий",
  description: "Карточная игра про арбитражных управляющих",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#1B1B1B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;900&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/images/logo-upravlyayushchiy.png" />
      </head>
      <body>
        {children}
        <a className="site-link" href="https://poluianov.ru" target="_blank" rel="noopener noreferrer">
          poluianov.ru
        </a>
        <BugLink/>
      </body>
    </html>
  );
}
