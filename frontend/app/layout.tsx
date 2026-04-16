import type { Metadata } from 'next';
import { Inter, Poppins, Vazirmatn } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/theme';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});
// Vazirmatn = modern Vazir family (Google Fonts) — Persian/Arabic glyphs.
const vazir = Vazirmatn({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-vazir',
});

export const metadata: Metadata = {
  title: 'TalkingHeadAI — Primentoring',
  description: 'Real-time conversational mentor powered by AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} ${vazir.variable} ${inter.className}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
