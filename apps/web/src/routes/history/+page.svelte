<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    isNip07Available,
    loginWithNip07,
    getWorshipHistory,
    getTotalPoints,
    formatPublicKey,
    formatDateTime,
    type WorshipRecord
  } from '$lib/nostr';

  let userPubkey = '';
  let isLoggedIn = false;
  let isLoading = false;
  let error = '';
  let worshipHistory: WorshipRecord[] = [];
  let totalPoints = 0;

  onMount(() => {
    if (!isNip07Available()) {
      error = 'NIP-07対応のNostrクライアント（Alby、nos2x等）をインストールしてください';
    }
  });

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
      loadHistory();
    } catch (err) {
      error = err instanceof Error ? err.message : 'ログインに失敗しました';
    } finally {
      isLoading = false;
    }
  }

  function loadHistory() {
    if (!userPubkey) return;
    
    worshipHistory = getWorshipHistory(userPubkey);
    totalPoints = getTotalPoints(userPubkey);
  }

  function logout() {
    userPubkey = '';
    isLoggedIn = false;
    worshipHistory = [];
    totalPoints = 0;
    error = '';
  }
</script>

<svelte:head>
  <title>参拝履歴 - Nostr神社</title>
</svelte:head>

<div class="history-page">
  <div class="page-header">
    <h1>📜 参拝履歴</h1>
    <nav class="breadcrumb">
      <a href="/">🏠 ホーム</a> > 参拝履歴
    </nav>
  </div>

  {#if !isLoggedIn}
    <section class="login-section card">
      <h2>🔐 ログインが必要です</h2>
      <p>参拝履歴を確認するには、NIP-07でログインしてください。</p>
      
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
    </section>
  {:else}
    <section class="user-summary card">
      <div class="summary-header">
        <h2>📊 参拝サマリー</h2>
        <button class="btn btn-secondary" on:click={logout}>ログアウト</button>
      </div>
      
      <div class="summary-stats">
        <div class="stat-item">
          <div class="stat-value">{totalPoints}</div>
          <div class="stat-label">総ポイント</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{worshipHistory.length}</div>
          <div class="stat-label">参拝回数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{formatPublicKey(userPubkey)}</div>
          <div class="stat-label">公開鍵</div>
        </div>
      </div>
    </section>

    <section class="history-section card">
      <h2>🗓️ 参拝記録</h2>
      
      {#if worshipHistory.length === 0}
        <div class="no-history">
          <p>まだ参拝記録がありません。</p>
          <a href="/" class="btn btn-primary">参拝する</a>
        </div>
      {:else}
        <div class="history-list">
          {#each worshipHistory as record}
            <div class="history-item">
              <div class="history-date">
                <div class="date-text">{record.date}</div>
                <div class="points-earned">+{record.points}pt</div>
              </div>
              
              {#if record.omikuji}
                <div class="omikuji-summary">
                  <div class="fortune-badge" style="background-color: {record.omikuji.color}20; color: {record.omikuji.color}">
                    {record.omikuji.fortuneText}
                  </div>
                  <div class="fortune-message">
                    {record.omikuji.message}
                  </div>
                </div>
              {/if}
              
              {#if record.eventId}
                <div class="event-info">
                  <small>イベントID: <code>{record.eventId.slice(0, 16)}...</code></small>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if error}
    <div class="message error">
      ❌ {error}
    </div>
  {/if}
</div>

<style>
  .history-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }

  .page-header {
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 2.5rem;
    margin-bottom: 8px;
    color: #333;
  }

  .breadcrumb {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .breadcrumb a {
    color: #007bff;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  .card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    border: 1px solid #e1e8ed;
  }

  .card h2 {
    margin-bottom: 20px;
    color: #333;
    font-size: 1.5rem;
  }

  /* ログインセクション */
  .login-section {
    text-align: center;
  }

  .login-actions {
    margin-top: 20px;
  }

  /* サマリーセクション */
  .summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .summary-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 20px;
  }

  .stat-item {
    text-align: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #495057;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #6c757d;
  }

  /* 履歴セクション */
  .no-history {
    text-align: center;
    padding: 40px 20px;
    color: #6c757d;
  }

  .no-history p {
    margin-bottom: 20px;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .history-item {
    padding: 20px;
    border: 1px solid #e1e8ed;
    border-radius: 12px;
    background: #fafbfc;
  }

  .history-date {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .date-text {
    font-weight: 600;
    color: #495057;
  }

  .points-earned {
    background: #28a745;
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .omikuji-summary {
    margin-bottom: 12px;
  }

  .fortune-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 8px;
  }

  .fortune-message {
    font-size: 0.9rem;
    color: #495057;
    line-height: 1.4;
  }

  .event-info {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dotted #dee2e6;
  }

  .event-info code {
    background: #e9ecef;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
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
    margin-top: 20px;
  }

  .message.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  /* レスポンシブ */
  @media (max-width: 768px) {
    .history-page {
      padding: 10px;
    }

    .page-header h1 {
      font-size: 2rem;
    }

    .summary-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .summary-stats {
      grid-template-columns: 1fr;
    }

    .history-date {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }
</style>