import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./waiting.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "整理券 | もののけの鍵",
  description: "もののけの鍵の整理券を発行・確認できます。",
};

export default function WaitingLanguagePage() {
  return (
    <main className={`${styles.waitingPage} ${styles.languagePage} waitingViewport`}>
      <header className={styles.brandHeader}>
        <p>もののけの鍵</p>
        <Image
          src={`${BASE_PATH}/assets/mononoke-no-kagi.png`}
          alt=""
          width={144}
          height={144}
          priority
          unoptimized
        />
      </header>

      <section className={styles.languageCard} aria-labelledby="language-title">
        <p className={styles.eyebrow}>TIMED ENTRY TICKET</p>
        <h1 id="language-title">言語を選択してください</h1>
        <p lang="en">Please select your language.</p>
        <div className={styles.languageActions}>
          <Link href="/waiting/jp/">日本語</Link>
          <Link href="/waiting/en/" lang="en">English</Link>
        </div>
      </section>
    </main>
  );
}
