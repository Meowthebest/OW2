import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { purgeRetiredData } from './lib/storage';
import './styles/tokens.css';
import './styles/base.css';
import './styles/randomizer.css';
import './styles/career.css';

purgeRetiredData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
