# Discord Universal SDK

> [!TIP]
> このリポジトリ・ライブラリは設計段階です。<br>
> ほぼCopilotと相談して企画・構想段階でしかない為、内容は大きく変化する可能性があります。

Discord.jsに代わる次世代マルチランタイム対応Discordライブラリ

**重要:** 本ライブラリは**完全新規設計**であり、Discord.jsとの後方互換性は提供しません。

## 🚀 特徴

- **マルチランタイム対応**: Node.js, Deno, Bun, Cloudflare Workers, Fastly Compute
- **マルチフレームワーク対応**: Hono, Next.js, Express.js, Fastify, Nuxt.js, itty-router

- **オブジェクト指向設計**: TypeScriptのOOPを最大限活用
- **型安全性**: Interface駆動開発による完全な型安全性
- **コンポーネント再利用性**: クラス継承による高い再利用性
- **柔軟なキャッシュ**: オプショナル&カスタマイズ可能なキャッシュシステム
- **インテリジェントエラーハンドリング**: 自動リトライ・フォールバック機能
- **ランタイム制約透明性**: 実行環境の制約を事前検出・警告
- **CustomId衝突防止**: 自動検出とコンパイル時検証

## 🏗️ アーキテクチャ

本ライブラリは以下のGoFデザインパターンを採用しています：

- **Strategy Pattern**: Interaction受信方式の切り替え（Gateway/Webhook）
- **OOPベース設計**: 直接クラス使用によるシンプルで型安全な設計
- **Adapter Pattern**: フレームワーク間の差異吸収
- **Command Pattern**: Interactionコマンドの管理
- **Observer Pattern**: イベント通知システム

## 📖 ドキュメント

- [要件定義書](./REQUIREMENTS.md) - プロジェクトの要件と目的
- [詳細設計仕様書](./DESIGN.md) - アーキテクチャと実装詳細
- [システム設計図](./ARCHITECTURE.md) - Mermaidによるシステム構成図

## 🎯 Discord.jsとの比較

| 項目 | Discord.js | Discord Universal SDK |
|------|------------|----------------------|
| ランタイム | Node.js専用 | マルチランタイム対応 |
| Interaction受信 | Gateway専用 | Gateway/Webhook両対応 |
| コンポーネント | Builderパターン | オブジェクト指向クラス |
| 型安全性 | 部分的 | Interface駆動完全型安全 |
| 継承・拡張 | 困難 | クラス継承で容易 |
| キャッシュ | 自動・固定 | オプショナル・カスタマイズ可能 |
| エラーハンドリング | 基本的 | 自動リトライ・フォールバック |
| ランタイム制約 | 不透明 | 事前検出・警告 |
| CustomId管理 | 手動 | 自動衝突検出 |
| データ永続化 | 非対応 | マルチストレージ対応 |
| バンドルサイズ | 大 | Tree-shaking対応 |
| ドキュメント | 分散 | 統一 |

## 🔧 基本的な使い方

### Gateway方式 (従来のBOT)

```typescript
import { NodeDiscordClient, InteractionManager } from 'discord-universal-sdk'

// intentsは自動推定されるので通常は不要
const client = new NodeDiscordClient({
  token: 'YOUR_BOT_TOKEN'
  // intents: ['GUILDS'] // 必要な場合のみ明示的に指定
})

// Interface継承のクラスベース設計
class HelloCommand implements ISlashCommand {
  public readonly name = 'hello'
  public readonly description = 'Say hello to the world'

  async execute(interaction: SlashCommandInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Hello, World!'
      }
    }
  }
}

const interactionManager = new InteractionManager()
interactionManager.register(HelloCommand)

await client.connect()
```

### Webhook方式 (Cloudflare Workers)

```typescript
import { CloudflareDiscordClient, HonoAdapter } from 'discord-universal-sdk'
import { Hono } from 'hono'

const app = new Hono()
const client = new CloudflareDiscordClient({
  token: 'YOUR_BOT_TOKEN'
})

const adapter = new HonoAdapter()

app.post('/interactions', async (c) => {
  const request = adapter.parseRequest(c)

  // CloudflareWorkerのctx.waitUntil対応（バインド方式）
  const response = await client.handleWebhook(request, {
    waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx)
  })

  return adapter.createResponse(response)
})

export default app
```

### オブジェクト指向コンポーネントシステム

```typescript
import { IButtonComponent, IModalComponent } from 'discord-universal-sdk'

// Interface + クラス実装による型安全な設計
export class ConfirmButton implements IButtonComponent {
  public readonly customId = 'confirm-action'
  public readonly label = 'Confirm'
  public readonly style = ButtonStyle.Success

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'Confirmed!' }
    }
  }
}

// モーダルコンポーネントの実装
export class SayCommandModal implements IModalComponent {
  public readonly customId = 'command-sayCommandModal'
  public readonly title = 'SAYコマンド'

  public readonly components = [
    {
      customId: 'InputMessage',
      label: 'メッセージ内容',
      style: TextInputStyle.Paragraph,
      minLength: 1,
      placeholder: 'ここに入力された内容が発言されます。'
    }
  ] as const

  async execute(interaction: ModalInteraction): Promise<InteractionResponse> {
    // 同じクラス内から型安全に参照
    const messageContent = interaction.fields.getTextInputValue(
      this.components[0].customId  // ← 完全に型安全！
    )

    await interaction.channel.send({ content: messageContent })

    return {
      type: InteractionResponseType.UpdateMessage,
      data: { content: 'Success!!' }
    }
  }
}

// InteractionManager による統一管理
const interactionManager = new InteractionManager()

// コマンドとコンポーネントの統一登録
interactionManager.register(HelloCommand)
interactionManager.register(ConfirmButton)
interactionManager.register(SayCommandModal)

// 型安全で簡単な使用
const message = {
  content: 'Please choose an action:',
  components: [
    {
      type: ComponentType.ActionRow,
      components: [ConfirmButton]  // クラスを直接指定
    }
  ]
}
```

### 型安全なEmbedシステム

```typescript
// ❌ Discord.js (Builder)
const embed = new EmbedBuilder()
  .setTitle("Title")
  .setDescription("Description")
  .setColor(0xFF0000)

// ✅ Discord Universal SDK (Type-safe Object with satisfies)
const embed = {
  title: "Title",
  description: "Description",
  color: 0xFF0000,
  type: EmbedType.Rich
} satisfies MessageEmbed

// 受信したEmbedをそのまま編集・再送信
const receivedEmbed = message.embeds[0]
const modifiedEmbed = {
  ...receivedEmbed,
  title: "Modified Title"
} satisfies MessageEmbed
```

## 🛡️ エラーハンドリング & 制約管理

### 自動エラーハンドリング

```typescript
// 自動リトライ機能付きのAPI呼び出し
const client = new NodeDiscordClient({
  token: 'YOUR_BOT_TOKEN',
  errorHandling: {
    maxRetries: 3,
    retryDelay: 1000,
    useExponentialBackoff: true,
    fallbackStrategy: 'graceful' // 'throw' | 'graceful' | 'silent'
  }
})

// エラーハンドリング戦略の設定
class MyCommand implements ISlashCommand {
  async execute(interaction: SlashCommandInteraction): Promise<InteractionResponse> {
    try {
      // 重い処理
      const result = await heavyComputation()
      return { type: InteractionResponseType.ChannelMessageWithSource, data: { content: result } }
    } catch (error) {
      // SDKが自動的に適切なエラーレスポンスを生成
      throw new ComponentError('処理中にエラーが発生しました', {
        cause: error,
        fallbackMessage: '一時的なエラーです。しばらくしてからお試しください。'
      })
    }
  }
}
```

### ランタイム制約の透明性

```typescript
// Cloudflare Workers特有の制約を事前検出
const client = new CloudflareDiscordClient({
  token: 'YOUR_BOT_TOKEN',
  constraints: {
    maxExecutionTime: 10000, // 10秒制限を明示
    validateConstraints: true // 制約違反を事前チェック
  }
})

// 制約違反を事前に検出
class LongRunningCommand implements ISlashCommand {
  async execute(interaction: SlashCommandInteraction): Promise<InteractionResponse> {
    // この処理は15秒かかる予定
    // → CloudflareWorkers環境では警告またはエラーを発生
    if (RuntimeDetector.isCloudflareWorkers()) {
      throw new RuntimeConstraintError(
        'この処理はCloudflare Workersの実行時間制限(10秒)を超える可能性があります'
      )
    }

    return await longRunningProcess()
  }
}
```

### CustomId衝突防止システム

```typescript
// Template Literal Typesによるコンパイル時検証
type CustomIdPrefix = 'button' | 'modal' | 'select'
type CustomIdSuffix = 'confirm' | 'cancel' | 'edit'
type SafeCustomId = `${CustomIdPrefix}-${CustomIdSuffix}`

class TypeSafeButton implements IButtonComponent {
  // コンパイル時に一意性をチェック
  public readonly customId: SafeCustomId = 'button-confirm'
  public readonly label = 'Confirm'

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    // 実装...
  }
}

// 実行時衝突検出
const interactionManager = new InteractionManager({
  validateCustomIds: true, // 登録時に重複チェック
  customIdConflictStrategy: 'throw' // 'throw' | 'warn' | 'ignore'
})
```

## 💾 データ永続化戦略

### マルチストレージ対応

```typescript
// Node.js環境 - Redis + PostgreSQL
const nodePersistence = new NodePersistenceAdapter({
  cache: new RedisAdapter('redis://localhost:6379'),
  database: new PostgreSQLAdapter('postgresql://...'),
  fallback: new FileSystemAdapter('./data')
})

// Cloudflare Workers - KV + D1
const cfPersistence = new CloudflarePersistenceAdapter({
  cache: new KVAdapter(env.MY_KV),
  database: new D1Adapter(env.MY_D1),
  fallback: new DurableObjectAdapter(env.MY_DO)
})

// 統一インターフェース
const client = new NodeDiscordClient({
  token: 'YOUR_BOT_TOKEN',
  persistence: nodePersistence // 環境に応じて切り替え
})
```

### セッション管理

```typescript
// セッションベースのデータ永続化
class StatefulModal implements IModalComponent {
  public readonly customId = 'stateful-modal'

  async execute(interaction: ModalInteraction): Promise<InteractionResponse> {
    // セッションデータを取得
    const sessionData = await interaction.client.persistence.getSession(interaction.user.id)

    // 処理...

    // セッションデータを更新
    await interaction.client.persistence.updateSession(interaction.user.id, {
      lastAction: 'modal-submitted',
      timestamp: Date.now()
    })

    return { type: InteractionResponseType.UpdateMessage, data: { content: 'Success!' } }
  }
}
```

## 🎯 OOPベースの設計

このSDKは**オブジェクト指向プログラミング（OOP）**を基盤とした設計になっています：

- **直接クラス使用**: Factoryパターンではなく、ランタイム固有のクラスを直接インスタンス化
- **型安全性**: TypeScriptのクラス型を活用した強固な型チェック
- **継承と拡張**: クラス継承により機能の拡張が容易
- **カプセル化**: プライベートメソッドとプロパティによる内部実装の隠蔽
- **多態性**: インターフェースを通じた統一的なAPI提供

```typescript
// ❌ Factory パターン（旧方式）
const client = ClientFactory.create('node', config)

// ✅ OOP ベース（新方式）
const client = new NodeDiscordClient(config)
```

## 🔧 実装時のベストプラクティス

### 1. 型安全な設計パターン

```typescript
// Interfaceを活用した型安全な設計
interface ICommandWithOptions<T extends Record<string, any>> {
  name: string
  description: string
  options: T
  execute(interaction: SlashCommandInteraction<T>): Promise<InteractionResponse>
}

// 使用例
class EchoCommand implements ICommandWithOptions<{ message: string }> {
  name = 'echo'
  description = 'Echo a message'
  options = {
    message: {
      type: ApplicationCommandOptionType.String,
      description: 'Message to echo',
      required: true
    }
  } as const

  async execute(interaction: SlashCommandInteraction<{ message: string }>) {
    // interaction.options.getString('message') は完全に型安全
    const message = interaction.options.getString('message') // string型が保証される
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: `Echo: ${message}` }
    }
  }
}
```

### 2. ライフサイクル管理

```typescript
// コンポーネントのライフサイクル管理
class ManagedComponent implements IButtonComponent {
  public readonly customId = 'managed-button'
  public readonly label = 'Click Me'

  // 自動クリーンアップ
  onDestroy?(): void {
    // リソースのクリーンアップ
    this.cleanupResources()
  }

  // TTL（Time To Live）設定
  get ttl(): number {
    return 5 * 60 * 1000 // 5分でタイムアウト
  }

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    // 実装...
  }
}
```

### 3. 環境固有の最適化

```typescript
// 環境に応じた最適化
class OptimizedCommand implements ISlashCommand {
  async execute(interaction: SlashCommandInteraction): Promise<InteractionResponse> {
    // 実行環境に応じて処理を分岐
    if (RuntimeDetector.isCloudflareWorkers()) {
      // Cloudflare Workers: 軽量処理
      return await this.lightweightProcess(interaction)
    } else if (RuntimeDetector.isNode()) {
      // Node.js: 高性能処理
      return await this.heavyProcess(interaction)
    } else {
      // その他の環境: 汎用処理
      return await this.genericProcess(interaction)
    }
  }
}
```

## 🚧 開発状況

このプロジェクトは現在要件定義・設計フェーズです。

### 開発フェーズ

- [x] **Phase 0**: 要件定義・設計 (完了)
- [ ] **Phase 1**: コア開発 (1-2ヶ月)
- [ ] **Phase 2**: Gateway実装 (1ヶ月)
- [ ] **Phase 3**: Interaction システム (1ヶ月)
- [ ] **Phase 4**: コンポーネント (1ヶ月)
- [ ] **Phase 5**: アダプター開発 (1ヶ月)
- [ ] **Phase 6**: ドキュメント・最終調整 (1ヶ月)

## 🤝 貢献

このプロジェクトは現在設計段階ですが、以下の形で貢献できます：

- 要件や設計に対するフィードバック
- 実装前の設計レビュー
- ドキュメントの改善提案

## � ドキュメント管理

**重要**: 要件や設計変更時は関連ドキュメントの同期更新が必要です。

### 更新チェックリスト

- [ ] 要件変更 → REQUIREMENTS.md, DESIGN.md, ARCHITECTURE.md の図
- [ ] 設計変更 → DESIGN.md, ARCHITECTURE.md のクラス図・シーケンス図
- [ ] 新機能追加 → 全ドキュメント + 対応するMermaid図
- [ ] API変更 → README.md の使用例コード

## ⚠️ 注意事項・制限事項

### ランタイム固有の制約

```typescript
// Cloudflare Workers
- 最大実行時間: 10秒 (waitUntil使用時は延長可能)
- ファイルシステム: 利用不可
- WebSocket: 利用不可 (Durable Objects経由で可能)

// Deno
- Node.js互換性: 一部制限あり
- npm パッケージ: 互換性レイヤー経由

// Bun
- 一部のNode.js API: 実装が異なる場合あり
```

### 推奨事項

1. **CustomId命名**: `{prefix}-{action}-{id}` 形式を推奨
2. **エラーハンドリング**: 必ず適切なフォールバックを設定
3. **ランタイム制約**: 事前に制約チェックを有効化
4. **セッション管理**: 長時間のやり取りでは永続化を活用
5. **型安全性**: Template Literal TypesでCustomIdを管理

### よくある落とし穴

```typescript
// ❌ 悪い例: CustomId重複
class Button1 implements IButtonComponent {
  customId = 'button' // 汎用的すぎる
}
class Button2 implements IButtonComponent {
  customId = 'button' // 重複！
}

// ✅ 良い例: 一意なCustomId
class ConfirmButton implements IButtonComponent {
  customId = 'confirm-delete-user-button' // 具体的で一意
}
```

## �📝 ライセンス

MIT License (予定)
