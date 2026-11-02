<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    offen?: boolean;
    titel?: string;
    onclose?: () => void;
    children?: Snippet;
  }

  let { offen = false, titel = '', onclose, children }: Props = $props();
  let sheet = $state<HTMLDivElement | null>(null);
  let zuletztFokussiert: HTMLElement | null = null;
  let warOffen = false;

  $effect(() => {
    if (offen && !warOffen) {
      warOffen = true;
      zuletztFokussiert = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void tick().then(() => {
        const erstesElement = sheet?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (erstesElement) erstesElement.focus();
        else sheet?.focus();
      });
    } else if (!offen && warOffen) {
      warOffen = false;
      zuletztFokussiert?.focus();
      zuletztFokussiert = null;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && offen) {
      onclose?.();
      return;
    }
    if (e.key !== 'Tab' || !offen || !sheet) return;

    const fokusierbar = Array.from(sheet.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ));
    if (fokusierbar.length === 0) {
      e.preventDefault();
      sheet.focus();
      return;
    }

    const zuerst = fokusierbar[0];
    const zuletzt = fokusierbar[fokusierbar.length - 1];
    if (e.shiftKey && (document.activeElement === zuerst || document.activeElement === sheet)) {
      e.preventDefault();
      zuletzt.focus();
    } else if (!e.shiftKey && document.activeElement === zuletzt) {
      e.preventDefault();
      zuerst.focus();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if offen}
  <div class="sheet-scrim" onclick={onclose} role="presentation"></div>

  <div bind:this={sheet} class="sheet-container" role="dialog" aria-modal="true" aria-label={titel} tabindex="-1">
    <div class="sheet-handle-bereich" role="presentation">
      <div class="sheet-handle"></div>
    </div>

    {#if titel}
      <div class="sheet-kopf">
        <h2 class="sheet-titel">{titel}</h2>
        <button class="sheet-schliessen" onclick={onclose} aria-label="Schließen">
          <Icon name="x" size={20} />
        </button>
      </div>
    {/if}

    <div class="sheet-inhalt">
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .sheet-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 900;
    animation: scrimFade 180ms ease-out forwards;
  }

  .sheet-container {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 85dvh;
    background: var(--flaeche);
    border-top: 1px solid var(--glas-kante);
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.7);
    z-index: 950;
    display: flex;
    flex-direction: column;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
    animation: sheetSpringUp 260ms var(--feder-aus) forwards;
  }

  .sheet-handle-bereich {
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
  }

  .sheet-handle {
    width: 38px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
  }

  .sheet-kopf {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px 14px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .sheet-titel {
    font-family: var(--font-headline);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--tinte);
    margin: 0;
  }

  .sheet-schliessen {
    background: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 50%;
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tinte-2);
    cursor: pointer;
    transition: background-color var(--zeit-schnell) ease-out, transform var(--zeit-schnell) ease-out;
  }
  .sheet-schliessen:active {
    transform: scale(0.92);
  }

  .sheet-inhalt {
    padding: 18px 20px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
  }

  @keyframes scrimFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sheetSpringUp {
    from {
      transform: translateY(100%);
      opacity: 0.9;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-scrim, .sheet-container {
      animation: none;
    }
  }
</style>
