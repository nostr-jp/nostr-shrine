<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  
  // ナビゲーションメニュー
  const navItems = [
    { href: '/', label: 'ホーム', icon: '⛩️' },
    { href: '/history', label: '参拝履歴', icon: '📜' }
  ];
</script>

<div class="app">
  <!-- ヘッダー -->
  <header class="header">
    <div class="container">
      <div class="header-content">
        <div class="logo">
          <h1>
            <a href="/">
              <span class="shrine-glow">⛩️</span>
              Nostr神社
            </a>
          </h1>
          <p class="tagline">デジタルおみくじ・参拝システム</p>
        </div>
        
        <nav class="nav">
          {#each navItems as item}
            <a 
              href={item.href} 
              class="nav-item"
              class:active={$page.url.pathname === item.href}
            >
              <span class="nav-icon">{item.icon}</span>
              <span class="nav-label">{item.label}</span>
            </a>
          {/each}
        </nav>
      </div>
    </div>
  </header>

  <!-- メインコンテンツ -->
  <main class="main">
    <div class="container">
      <slot />
    </div>
  </main>

  <!-- フッター -->
  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-section">
          <h3>Nostr神社について</h3>
          <p>Nostr上で楽しめるデジタルおみくじ・参拝システムです。NIP-07でログインして、毎日参拝してポイントを貯めましょう！</p>
        </div>
        
        <div class="footer-section">
          <h3>機能</h3>
          <ul>
            <li>🔐 NIP-07ログイン</li>
            <li>⛩️ 1日1回参拝</li>
            <li>🎲 デジタルおみくじ</li>
            <li>📱 SNSシェア</li>
          </ul>
        </div>
        
        <div class="footer-section">
          <h3>技術</h3>
          <ul>
            <li>Nostr Protocol</li>
            <li>Cloudflare Workers</li>
            <li>SvelteKit</li>
            <li>nostr-tools</li>
          </ul>
        </div>
      </div>
      
      <div class="footer-bottom">
        <p>&copy; 2024 Nostr神社. MIT License.</p>
      </div>
    </div>
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
  }

  /* ヘッダー */
  .header {
    background: white;
    box-shadow: var(--shrine-shadow);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
  }

  .logo h1 a {
    text-decoration: none;
    color: var(--shrine-red);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.8rem;
  }

  .tagline {
    font-size: 0.9rem;
    color: var(--shrine-gray);
    margin-top: 4px;
  }

  .nav {
    display: flex;
    gap: 8px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    text-decoration: none;
    color: var(--shrine-black);
    border-radius: 8px;
    transition: all 0.3s ease;
    font-weight: 500;
  }

  .nav-item:hover {
    background: rgba(199, 62, 29, 0.1);
    color: var(--shrine-red);
  }

  .nav-item.active {
    background: var(--shrine-gradient);
    color: white;
  }

  .nav-icon {
    font-size: 1.2rem;
  }

  /* メイン */
  .main {
    flex: 1;
    padding: 40px 0;
  }

  /* フッター */
  .footer {
    background: var(--shrine-black);
    color: var(--shrine-white);
    padding: 40px 0 20px;
    margin-top: auto;
  }

  .footer-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 30px;
    margin-bottom: 30px;
  }

  .footer-section h3 {
    color: var(--shrine-gold);
    margin-bottom: 16px;
    font-size: 1.2rem;
  }

  .footer-section ul {
    list-style: none;
  }

  .footer-section li {
    margin-bottom: 8px;
    color: var(--shrine-gray);
  }

  .footer-bottom {
    text-align: center;
    padding-top: 20px;
    border-top: 1px solid var(--shrine-gray);
    color: var(--shrine-gray);
  }

  /* レスポンシブ */
  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      gap: 16px;
    }

    .nav {
      flex-wrap: wrap;
      justify-content: center;
    }

    .nav-label {
      display: none;
    }

    .nav-item {
      padding: 8px 12px;
    }

    .footer-content {
      grid-template-columns: 1fr;
      text-align: center;
    }
  }
</style>
