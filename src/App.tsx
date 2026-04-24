import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Overwatch2RandomHeroPickerMultiRoleLock from "./components/Overwatch2RandomHeroPickerMultiRoleLock";

const FAQ = [
  {
    question: "What is improved in this version?",
    answer: "The old OW2 visual vibe is preserved, but spacing, hierarchy, and controls are cleaner and easier to scan.",
  },
  {
    question: "Are missing hero images handled?",
    answer: "Yes. Hero image paths are restored and each image has a robust fallback so cards stay polished.",
  },
  {
    question: "Can player progress be edited manually?",
    answer: "Yes. Each player card now supports editing, resetting, and tracking completion progress.",
  },
];

export default function App() {
  const [activeFaq, setActiveFaq] = useState(0);

  return (
    <motion.div
      className="app-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <header className="topbar glass">
        <div className="brand">
          <span className="brand-badge" />
          <div>
            <h1>OW2 Draft Studio</h1>
            <p>Cleaner tactical randomizer with progress tracking</p>
          </div>
        </div>
        <a className="topbar-link" href="#picker">
          Open Picker
        </a>
      </header>

      <main className="main-layout">
        <section className="hero-card glass">
          <p className="eyebrow">Modernized Theme</p>
          <h2>Old OW2 energy, new UX quality.</h2>
          <p>
            This pass improves readability, animation smoothness, and feature clarity while preserving
            your core drafting flow.
          </p>
          <div className="hero-points">
            <span>Faster scanning</span>
            <span>Stronger visual consistency</span>
            <span>Mobile-first card behavior</span>
            <span>Safer destructive actions</span>
          </div>
        </section>

        <section id="picker" className="picker-host glass">
          <Overwatch2RandomHeroPickerMultiRoleLock />
        </section>

        <section className="faq-grid">
          <article className="panel glass">
            <h3>Quick FAQ</h3>
            <div className="faq-list">
              <AnimatePresence initial={false}>
                {FAQ.map((item, index) => (
                  <motion.div key={item.question} className="faq-item" layout>
                    <button type="button" onClick={() => setActiveFaq(activeFaq === index ? -1 : index)}>
                      {item.question}
                    </button>
                    <AnimatePresence initial={false}>
                      {activeFaq === index && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          {item.answer}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </article>

          <article className="panel glass">
            <h3>UX Focus</h3>
            <ul className="clean-list">
              <li>Compact sections with better alignment</li>
              <li>Consistent button and card behavior</li>
              <li>Improved empty/error/loading feedback</li>
              <li>Smooth transitions for key interactions</li>
            </ul>
          </article>
        </section>
      </main>
    </motion.div>
  );
}
