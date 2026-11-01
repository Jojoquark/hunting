<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variante?: 'kapsel' | 'panel' | 'schwebend';
    klasse?: string;
    children?: Snippet;
  }

  let { variante = 'kapsel', klasse = '', children }: Props = $props();
</script>

<div class="glas-kapsel glas-variante-{variante} {klasse}">
  {@render children?.()}
</div>

<style>
  .glas-kapsel {
    position: relative;
    background: var(--glas-grund);
    border: 1px solid var(--glas-kante);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
    box-shadow: inset 0 1px 0 0 var(--glas-glanz), var(--schatten-kapsel);
    transition: transform var(--zeit-standard) var(--feder-aus), opacity 150ms ease-out;
    color: var(--tinte);
    overflow: hidden;
  }

  .glas-variante-kapsel {
    border-radius: var(--radius-kapsel);
    padding: 8px 16px;
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .glas-variante-panel {
    border-radius: var(--radius-l);
    padding: 18px 20px;
  }

  .glas-variante-schwebend {
    border-radius: var(--radius-m);
    padding: 12px 16px;
  }

  @media (prefers-reduced-transparency: reduce) {
    .glas-kapsel {
      background: var(--flaeche-erhoeht);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
</style>
