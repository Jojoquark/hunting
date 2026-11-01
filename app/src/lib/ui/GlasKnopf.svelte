<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variante?: 'primaer' | 'sekundaer' | 'gefahr' | 'flach';
    groesse?: 'sm' | 'md' | 'lg';
    breit?: boolean;
    deaktiviert?: boolean;
    typ?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    klasse?: string;
    children?: Snippet;
  }

  let {
    variante = 'sekundaer',
    groesse = 'md',
    breit = false,
    deaktiviert = false,
    typ = 'button',
    onclick,
    klasse = '',
    children
  }: Props = $props();
</script>

<button
  type={typ}
  disabled={deaktiviert}
  {onclick}
  class="glas-knopf knopf-{variante} groesse-{groesse} {breit ? 'ist-breit' : ''} {klasse}"
>
  {@render children?.()}
</button>

<style>
  .glas-knopf {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-kapsel);
    font-family: var(--font-body);
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    white-space: nowrap;
    text-decoration: none;
    border: 1px solid transparent;
    /* Emil Kowalski: GPU-Properties only, kein transition: all */
    transition: transform var(--zeit-schnell) var(--feder-aus),
                background-color var(--zeit-schnell) ease-out,
                border-color var(--zeit-schnell) ease-out,
                opacity var(--zeit-schnell) ease-out;
  }

  .groesse-sm {
    min-height: 44px;
    height: 44px;
    padding: 0 16px;
    font-size: 0.875rem;
  }

  .groesse-md {
    height: 48px;
    padding: 0 22px;
    font-size: 1rem;
  }

  .groesse-lg {
    height: 56px;
    padding: 0 28px;
    font-size: 1.125rem;
  }

  .ist-breit {
    width: 100%;
  }

  /* Taktile Rückmeldung beim Drücken */
  .glas-knopf:active:not(:disabled) {
    transform: scale(0.97);
  }

  .glas-knopf:focus-visible {
    outline: 2px solid var(--akzent);
    outline-offset: 3px;
  }

  /* Variante Primaer: Signal-Orange (Max 1 pro Glas-Ebene) */
  .knopf-primaer {
    background: var(--akzent);
    color: #0a0a0c;
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 16px rgba(255, 92, 0, 0.35);
  }
  .knopf-primaer:hover:not(:disabled) {
    background: var(--akzent-hover);
  }
  .knopf-primaer:active:not(:disabled) {
    background: var(--akzent-aktiv);
  }

  /* Variante Sekundaer: Flüssigglas */
  .knopf-sekundaer {
    background: var(--glas-grund);
    color: var(--tinte);
    border: 1px solid var(--glas-kante);
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
  }
  .knopf-sekundaer:hover:not(:disabled) {
    background: rgba(35, 35, 42, 0.85);
    border-color: rgba(255, 255, 255, 0.25);
  }

  /* Variante Gefahr */
  .knopf-gefahr {
    background: rgba(255, 59, 92, 0.16);
    color: var(--rolle-jaeger);
    border-color: rgba(255, 59, 92, 0.35);
  }
  .knopf-gefahr:hover:not(:disabled) {
    background: rgba(255, 59, 92, 0.28);
  }

  /* Variante Flach */
  .knopf-flach {
    background: transparent;
    color: var(--tinte-2);
  }
  .knopf-flach:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    color: var(--tinte);
  }

  .glas-knopf:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
  }
</style>
