import { useState } from "react";
import Overwatch2RandomHeroPickerMultiRoleLock from "./components/Overwatch2RandomHeroPickerMultiRoleLock";

const FAQ = [
  {
    question: "What changed in this redesign?",
    answer:
      "The site now uses a cleaner layout, simplified controls, and improved responsive behavior across phone, tablet, and desktop.",
  },
  {
    question: "Is data still saved?",
    answer:
      "Yes. Player names, role choices, and settings remain saved locally in your browser.",
  },
  {
    question: "Can this be used during live matches?",
    answer:
      "Yes. The interface is tuned for fast one-click actions, rerolls, and readable results.",
  },
];

export default function App() {
  const [activeFaq, setActiveFaq] = useState(0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge" />
          <div>
            <h1>OW2 Draft Studio</h1>
            <p>Modern random hero picker for squads</p>
          </div>
        </div>
        <a className="topbar-link" href="#picker">
          Jump To Picker
        </a>
      </header>

      <main className="main-layout">
        <section className="hero-card">
          <p className="eyebrow">Complete Rebuild</p>
          <h2>New style, new structure, only useful features.</h2>
          <p>
            This rebuild removes visual clutter and unnecessary complexity while keeping everything you
            need for quick hero drafting.
          </p>
          <div className="hero-points">
            <span>Cleaner controls</span>
            <span>Better mobile layout</span>
            <span>Faster randomization</span>
          </div>
        </section>

        <section id="picker" className="picker-host">
          <Overwatch2RandomHeroPickerMultiRoleLock />
        </section>

        <section className="faq-grid">
          <article className="panel">
            <h3>FAQ</h3>
            <div className="faq-list">
              {FAQ.map((item, index) => (
                <div key={item.question} className="faq-item">
                  <button type="button" onClick={() => setActiveFaq(activeFaq === index ? -1 : index)}>
                    {item.question}
                  </button>
                  {activeFaq === index && <p>{item.answer}</p>}
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <h3>What was removed</h3>
            <ul className="clean-list">
              <li>Over-animated transitions that slowed usability</li>
              <li>Duplicated CSS blocks and style collisions</li>
              <li>Nested UI patterns that made mobile cramped</li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
