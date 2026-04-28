<template>
  <a-layout class="main-session">
    <!-- Header -->
    <a-layout-header class="session__header">
      <div class="header__item">
        <img src="../assets/wireless-network.png" alt="WON Logo" />
        <span class="header__title">Wireless Optical Network</span>
        <span class="header__title--short">WON</span>
      </div>

      <div class="header__item">
        <a-button size="small">
          <a href="https://www.pumbadev.com" target="_blank" rel="noopener">
            Contato
          </a>
        </a-button>
        <a-button size="small" class="header__repo-btn">
          <a
            href="https://github.com/pumba-dev/wireless-optical-network-prototype"
            target="_blank"
            rel="noopener"
          >
            Repositório
          </a>
        </a-button>
      </div>
    </a-layout-header>

    <!-- Content -->
    <a-layout-content>
      <MainContent />
    </a-layout-content>

    <!-- Footer -->
    <a-layout-footer class="session__footer">
      <span>
        WON Prototype © 2023 ·
        <a href="https://www.pumbadev.com" target="_blank" rel="noopener">
          Pumba Developer
        </a>
      </span>
    </a-layout-footer>
  </a-layout>
</template>

<script setup lang="ts">
import MainContent from "./MainContent.vue";
</script>

<style scoped lang="scss">
.main-session {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;

  .session__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #2e5eaa;
    padding: 0 20px;

    .header__item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    img {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }

    .header__title {
      font-size: 1.25rem;
      font-weight: bold;
      color: white;
      white-space: nowrap;
    }

    .header__title--short {
      display: none;
      font-size: 1.25rem;
      font-weight: bold;
      color: white;
    }
  }

  .session__footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 0.8rem;

    a {
      &:hover {
        text-decoration: underline;
      }
    }
  }

  @media (max-width: 600px) {
    .session__header {
      padding: 0 12px;
      height: 52px;
      line-height: 52px;

      img {
        width: 30px;
        height: 30px;
      }

      .header__title {
        display: none;
      }

      .header__title--short {
        display: inline;
        font-size: 1.1rem;
      }

      .header__repo-btn {
        display: none;
      }
    }
  }
}
</style>
