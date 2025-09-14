<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    isNip07Available,
    loginWithNip07,
    signEventWithNip07,
    createWorshipEventUnsigned,
    sendEventToShrine,
    drawOmikuji,
    drawOmikujiFromShare,
    generateShareUrls,
    hasWorshippedToday,
    recordTodaysWorship,
    getTotalPoints,
    calculatePoints,
    formatPublicKey,
    formatDateTime,
    type OmikujiResult
  } from '$lib/nostr';

  // 状態管理
  let userPubkey = '';
  let isLoggedIn = false;
  let isLoading = false;
  let error = '';
  let success = '';
  let currentOmikuji: OmikujiResult | null = null;
  let totalPoints = 0;
  let hasWorshippedTodayFlag = false;
  let shareUrls: any = null;

  // コンポーネント初期化
  onMount(() => {
    // NIP-07の利用可能性をチェック
    if (!isNip07Available()) {
      error = 'NIP-07対応のNostrクライアント（Alby、nos2x等）をインストールしてください';
    }
  });

  // NIP-07でログイン
  async function login() {
    if (!isNip07Available()) {
      error = 'NIP-07対応のNostrクライアントが必要です';
      return;
    }

    isLoading = true;
    error = '';

    try {
      userPubkey = await loginWithNip07();
      isLoggedIn = true;
      totalPoints = getTotalPoints(userPubkey);
      hasWorshippedTodayFlag = hasWorshippedToday(userPubkey);
      success = 'ログインしました！';
    } catch (err) {
      error = err instanceof Error ? err.message : 'ログインに失敗しました';
    } finally {
      isLoading = false;
    }
  }

  // ログアウト
  function logout() {
    userPubkey = '';
    isLoggedIn = false;
    totalPoints = 0;
    hasWorshippedTodayFlag = false;
    currentOmikuji = null;
    shareUrls = null;
    success = 'ログアウトしました';
    error = '';
  }

  // おみくじを引く（SNSシェア用）
  function drawShareOmikuji() {
    const shareId = `share-${Date.now()}-${Math.random()}`;
    currentOmikuji = drawOmikujiFromShare(shareId);
    shareUrls = generateShareUrls(currentOmikuji);
    success = 'おみくじを引きました！SNSでシェアしてみてください。';
    error = '';
  }

  // 参拝する（1日1回制限）
  async function worship() {
    if (!isLoggedIn) {
      error = 'ログインが必要です';
      return;
    }

    if (hasWorshippedTodayFlag) {
      error = '今日はすでに参拝済みです。明日また参拝してください。';
      return;
    }

    isLoading = true;
    error = '';
    success = '';

    try {
      // おみくじを引く
      const omikuji = drawOmikuji();
      const points = calculatePoints(omikuji);

      // 参拝イベントを作成
      const unsignedEvent = createWorshipEventUnsigned(userPubkey);
      
      // NIP-07で署名
      const signedEvent = await signEventWithNip07(unsignedEvent);
      
      // 神社に送信
      const result = await sendEventToShrine(signedEvent);
      
      // ローカルに記録
      recordTodaysWorship(userPubkey, omikuji, points);
      
      // 状態更新
      currentOmikuji = omikuji;
      totalPoints = getTotalPoints(userPubkey);
      hasWorshippedTodayFlag = true;
      shareUrls = generateShareUrls(omikuji);
      
      success = `参拝完了！${points}ポイント獲得しました。`;
      
    } catch (err) {
      error = err instanceof Error ? err.message : '参拝に失敗しました';
    } finally {
      isLoading = false;
    }
  }

  // SNSでシェア
  function shareToSns(platform: 'twitter' | 'facebook' | 'line') {
    if (!shareUrls) return;
    window.open(shareUrls[platform], '_blank', 'width=600,height=400');
  }
</script>

<svelte:head>
  <title>Nostr神社 - デジタルおみくじ・参拝システム</title>
  <meta name="description" content="Nostr上で楽しめるデジタルおみくじ・参拝システム。NIP-07でログインして、毎日参拝してポイントを貯めよう！" />
</svelte:head>

<div class="shrine-app">
  <!-- ヒーローセクション -->
  <section class="hero">
    <div class="hero-content">
      <h1>
        <span class="shrine-icon">⛩️</span>
        Nostr神社
      </h1>
      <p class="hero-description">
        デジタルおみくじ・参拝システム<br>
        NIP-07でログインして、毎日参拝してポイントを貯めよう！
      </p>
    </div>
  </section>

  <div class="main-content">
    <!-- ログインセクション -->
    {#if !isLoggedIn}
      <section class="login-section card">
        <h2>🔐 ログイン</h2>
        <p>NIP-07対応のNostrクライアント（Alby、nos2x等）でログインしてください。</p>
        
        <div class="login-actions">
          <button 
            class="btn btn-primary" 
            on:click={login}
            disabled={isLoading || !isNip07Available()}
          >
            {#if isLoading}
              🔄 ログイン中...
            {:else}
              🔑 NIP-07でログイン
            {/if}
          </button>
        </div>

        {#if !isNip07Available()}
          <div class="nip07-help">
            <h3>📱 Nostrクライアントのインストール</h3>
            <ul>
              <li><a href="https://getalby.com/" target="_blank" rel="noopener">Alby</a> - ブラウザ拡張機能</li>
              <li><a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noopener">nos2x</a> - ブラウザ拡張機能</li>
            </ul>
          </div>
        {/if}
      </section>
    {:else}
      <!-- ユーザー情報 -->
      <section class="user-info card">
        <div class="user-header">
          <h2>👤 ユーザー情報</h2>
          <button class="btn btn-secondary" on:click={logout}>ログアウト</button>
        </div>
        
        <div class="user-details">
          <p><strong>公開鍵:</strong> <code>{formatPublicKey(userPubkey)}</code></p>
          <p><strong>総ポイント:</strong> <span class="points">{totalPoints}</span> pt</p>
          <p><strong>今日の参拝:</strong> 
            {#if hasWorshippedTodayFlag}
              <span class="status completed">✅ 完了</span>
            {:else}
              <span class="status pending">⏳ 未完了</span>
            {/if}
          </p>
        </div>
      </section>

      <!-- 参拝セクション -->
      <section class="worship-section card">
        <h2>🙏 参拝（1日1回）</h2>
        
        {#if hasWorshippedTodayFlag}
          <div class="already-worshipped">
            <p>今日はすでに参拝済みです。明日また参拝してください。</p>
            <p class="next-worship">次回参拝可能時刻: 明日 00:00</p>
          </div>
        {:else}
          <div class="worship-actions">
            <p>今日の参拝をして、おみくじを引いてポイントを獲得しましょう！</p>
            <button 
              class="btn btn-primary worship-btn"
              on:click={worship}
              disabled={isLoading}
            >
              {#if isLoading}
                🔄 参拝中...
              {:else}
                ⛩️ 参拝する
              {/if}
            </button>
          </div>
        {/if}
      </section>
    {/if}

    <!-- SNSシェアおみくじ -->
    <section class="share-omikuji card">
      <h2>🎲 SNSシェアおみくuji</h2>
      <p>ログインしなくても、おみくじを引いてSNSでシェアできます！</p>
      
      <div class="share-actions">
        <button class="btn btn-secondary" on:click={drawShareOmikuji}>
          🎯 おみくじを引く
        </button>
      </div>
    </section>

    <!-- おみくじ結果 -->
    {#if currentOmikuji}
      <section class="omikuji-result card">
        <h2>🎊 おみくじ結果</h2>
        
        <div class="omikuji-display" style="border-color: {currentOmikuji.color}">
          <div class="fortune-text" style="color: {currentOmikuji.color}">
            {currentOmikuji.fortuneText}
          </div>
          <div class="fortune-message">
            {currentOmikuji.message}
          </div>
        </div>

        {#if shareUrls}
          <div class="share-buttons">
            <h3>📱 SNSでシェア</h3>
            <div class="share-button-group">
              <button class="btn btn-twitter" on:click={() => shareToSns('twitter')}>
                🐦 Twitter
              </button>
              <button class="btn btn-facebook" on:click={() => shareToSns('facebook')}>
                📘 Facebook
              </button>
              <button class="btn btn-line" on:click={() => shareToSns('line')}>
                💚 LINE
              </button>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- メッセージ表示 -->
    {#if error}
      <div class="message error">
        ❌ {error}
      </div>
    {/if}

    {#if success}
      <div class="message success">
        ✅ {success}
      </div>
    {/if}

    <!-- 機能説明 -->
    <section class="features card">
      <h2>🌟 機能</h2>
      <div class="feature-list">
        <div class="feature-item">
          <h3>🔐 NIP-07ログイン</h3>
          <p>Nostrクライアント拡張機能でかんたんログイン</p>
        </div>
        <div class="feature-item">
          <h3>⛩️ 1日1回参拝</h3>
          <p>毎日参拝してポイントを貯められる</p>
        </div>
        <div class="feature-item">
          <h3>🎲 デジタルおみくじ</h3>
          <p>運勢に応じてポイントが変動</p>
        </div>
        <div class="feature-item">
          <h3>📱 SNSシェア</h3>
          <p>おみくじ結果をSNSでシェア</p>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .shrine-app {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }

  .hero {
    text-align: center;
    margin-bottom: 40px;
    padding: 60px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20px;
    color: white;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  }

  .hero h1 {
    font-size: 3.5rem;
    margin-bottom: 20px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
  }

  .shrine-icon {
    display: inline-block;
    animation: bounce 2s infinite;
  }

  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-10px); }
    60% { transform: translateY(-5px); }
  }

  .hero-description {
    font-size: 1.2rem;
    line-height: 1.8;
    opacity: 0.95;
  }

  .main-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    border: 1px solid #e1e8ed;
  }

  .card h2 {
    margin-bottom: 16px;
    color: #333;
    font-size: 1.5rem;
  }

  /* ログインセクション */
  .login-actions {
    margin: 20px 0;
  }

  .nip07-help {
    margin-top: 24px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .nip07-help h3 {
    margin-bottom: 12px;
    color: #495057;
  }

  .nip07-help ul {
    list-style: none;
    padding: 0;
  }

  .nip07-help li {
    margin-bottom: 8px;
  }

  .nip07-help a {
    color: #007bff;
    text-decoration: none;
  }

  .nip07-help a:hover {
    text-decoration: underline;
  }

  /* ユーザー情報 */
  .user-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .user-details p {
    margin-bottom: 12px;
  }

  .points {
    font-weight: bold;
    color: #28a745;
    font-size: 1.2rem;
  }

  .status.completed {
    color: #28a745;
    font-weight: bold;
  }

  .status.pending {
    color: #ffc107;
    font-weight: bold;
  }

  /* 参拝セクション */
  .already-worshipped {
    text-align: center;
    padding: 20px;
    background: #e8f5e8;
    border-radius: 8px;
    color: #155724;
  }

  .next-worship {
    font-size: 0.9rem;
    margin-top: 8px;
    opacity: 0.8;
  }

  .worship-actions {
    text-align: center;
  }

  .worship-btn {
    font-size: 1.3rem;
    padding: 16px 32px;
    margin-top: 16px;
  }

  /* おみくじ結果 */
  .omikuji-display {
    text-align: center;
    padding: 32px;
    border: 3px solid;
    border-radius: 16px;
    margin: 20px 0;
    background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%);
  }

  .fortune-text {
    font-size: 3rem;
    font-weight: bold;
    margin-bottom: 16px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
  }

  .fortune-message {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #495057;
  }

  /* シェアボタン */
  .share-buttons {
    margin-top: 24px;
  }

  .share-buttons h3 {
    margin-bottom: 12px;
    text-align: center;
  }

  .share-button-group {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn-twitter { background: #1da1f2; color: white; }
  .btn-facebook { background: #4267b2; color: white; }
  .btn-line { background: #00b900; color: white; }

  /* 機能説明 */
  .feature-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }

  .feature-item {
    text-align: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
  }

  .feature-item h3 {
    margin-bottom: 8px;
    color: #495057;
  }

  .feature-item p {
    font-size: 0.9rem;
    color: #6c757d;
    line-height: 1.4;
  }

  /* ボタンスタイル */
  .btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
    display: inline-block;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #5a6268;
    transform: translateY(-1px);
  }

  /* メッセージ */
  .message {
    padding: 16px;
    border-radius: 8px;
    font-weight: 600;
    text-align: center;
  }

  .message.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .message.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  /* レスポンシブ */
  @media (max-width: 768px) {
    .shrine-app {
      padding: 10px;
    }

    .hero h1 {
      font-size: 2.5rem;
    }

    .hero-description {
      font-size: 1rem;
    }

    .user-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .share-button-group {
      flex-direction: column;
    }

    .feature-list {
      grid-template-columns: 1fr;
    }
  }
</style>