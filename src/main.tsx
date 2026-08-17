import React from 'react';
import ReactDOM from 'react-dom/client';
import { GAME_TITLE } from '@game/branding';
import { App } from './ui/App';

document.title = GAME_TITLE;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
