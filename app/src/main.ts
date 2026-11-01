import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Root-Element #app im Dokument nicht gefunden.');
}

const app = mount(App, {
  target: container
});

export default app;
