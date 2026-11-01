<script lang="ts">
  interface Props {
    farbe?: string;
    groesse?: number;
    aktiv?: boolean;
  }

  let { farbe = 'var(--akzent)', groesse = 120, aktiv = true }: Props = $props();
</script>

{#if aktiv}
  <div
    class="radar-puls-container"
    style="--puls-farbe: {farbe}; width: {groesse}px; height: {groesse}px;"
    aria-hidden="true"
  >
    <div class="ring ring-1"></div>
    <div class="ring ring-2"></div>
    <div class="ring ring-3"></div>
    <div class="punkt"></div>
  </div>
{/if}

<style>
  .radar-puls-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid var(--puls-farbe);
    opacity: 0;
    /* Reine GPU-Eigenschaften transform & opacity */
    animation: radarWelle 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }

  .ring-1 {
    animation-delay: 0s;
  }

  .ring-2 {
    animation-delay: 0.5s;
  }

  .ring-3 {
    animation-delay: 1.0s;
  }

  .punkt {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--puls-farbe);
    box-shadow: 0 0 10px var(--puls-farbe);
  }

  @keyframes radarWelle {
    0% {
      transform: scale(0.15);
      opacity: 0.95;
    }
    40% {
      opacity: 0.6;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: none;
      transform: scale(1);
      opacity: 0.3;
    }
  }
</style>
