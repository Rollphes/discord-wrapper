# Discord Library 要件定義書

## 1. プロジェクト概要

### 1.1 プロジェクト名

Discord Universal SDK (仮称)

### 1.2 目的

現行のDiscord.jsの課題を解決し、マルチランタイム・マルチフレームワーク対応の次世代Discordライブラリを開発する。

**重要:** 本ライブラリは**完全新規設計**であり、Discord.jsとの後方互換性は提供しない。既存のDiscord.jsプロジェクトからの移行には、APIの違いを理解したコード書き換えが必要となる。

### 1.3 背景

Discord.jsに対する主な不満点：

- 頻繁なAPI変更と互換性の問題
- 複雑なキャッシュ管理システム
- InteractionHandlerの不便さ
- Node.js専用でCloudflare Workerなどで使用不可
- Builderパターンの過度な使用による複雑性
- 分散したドキュメント構造

## 2. ターゲット環境

### 2.1 ランタイム対応

- **Deno** (v1.x以降)
- **Node.js** (v18.x以降)
- **Bun** (v1.x以降)
- **Cloudflare Workers**
- **Fastly Compute**

### 2.2 フレームワーク対応

- **Hono** - 軽量WebフレームワークとしてのPrimary Support
- **Next.js** - React系フルスタックフレームワーク
- **Express.js** - Node.js定番Webフレームワーク
- **Fastify** - 高性能Webフレームワーク
- **Nuxt.js** - Vue.js系フルスタックフレームワーク
- **itty-router** - Cloudflare Workers向け軽量ルーター

### 2.3 CloudflareWorker固有要件

CloudflareWorkerの制約に対応した設計要件：

#### 2.3.1 ランタイム制約管理システム

```typescript
// 各ランタイムの制約を統一的に管理
export interface RuntimeConstraints {
  maxExecutionTime: number
  supportsLongRunning: boolean
  supportsFileSystem: boolean
  supportsWebSocket: boolean
}

export class ConstraintManager {
  static getConstraints(runtime: RuntimeType): RuntimeConstraints {
    switch (runtime) {
      case 'cloudflare-workers':
        return {
          maxExecutionTime: 10000, // 10ms
          supportsLongRunning: true, // waitUntil経由
          supportsFileSystem: false,
          supportsWebSocket: false
        }
      case 'nodejs':
        return {
          maxExecutionTime: Infinity,
          supportsLongRunning: true,
          supportsFileSystem: true,
          supportsWebSocket: true
        }
    }
  }
}

// ctx.waitUntil対応
interface CloudflareContext {
  waitUntil?: (promise: Promise<any>) => void
}

// Webhook処理でのctx.waitUntil対応
client.handleWebhook(request, {
  waitUntil: (promise) => ctx.waitUntil(promise)
})
```

#### 2.3.2 エラーハンドリング戦略

```typescript
// 統一されたエラー分類システム
export enum ErrorSource {
  DISCORD_API = 'discord_api',
  LIBRARY_INTERNAL = 'library_internal',
  USER_INPUT = 'user_input',
  RUNTIME_CONSTRAINT = 'runtime_constraint'
}

export class DiscordUniversalError extends Error {
  constructor(
    public readonly source: ErrorSource,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'DiscordUniversalError'
  }
}

// CloudflareWorkers特有の制約エラー
export class RuntimeConstraintError extends DiscordUniversalError {
  constructor(message: string, constraint: string, runtime: string) {
    super(ErrorSource.RUNTIME_CONSTRAINT, 'CONSTRAINT_VIOLATION', message, {
      constraint,
      runtime
    })
  }
}
```

#### 2.3.3 統一されたInteraction管理

コマンドとコンポーネントを単一のInteractionManagerで管理：

```typescript
class InteractionManager {
  // 型安全なコンポーネント登録
  register<T extends IInteractionHandler>(
    HandlerClass: new () => T
  ): T extends ISlashCommand
    ? SlashCommandRegistration<T>
    : T extends IButtonComponent
    ? ButtonComponentRegistration<T>
    : ComponentRegistration<T>

  // コンポーネント生成
  create<T extends IComponent>(ComponentClass: new () => T): MessageComponent

  // 統一されたInteraction処理
  handle(interaction: Interaction): Promise<InteractionResponse>
}
```

### 2.4 自動intents推定

登録されたInteractionHandlerから必要なintentsを自動推定：

```typescript
// intentsは自動推定される（手動指定も可能）
const client = new NodeDiscordClient({
  token: 'YOUR_BOT_TOKEN'
  // intents: ['GUILDS'] // 必要な場合のみ明示的に指定
})

// InteractionManagerの登録内容から自動判定
interactionManager.register(GuildInfoCommand)  // GUILDS intent自動追加
interactionManager.register(MessageEditCommand)  // GUILD_MESSAGES intent自動追加
```

### 2.5 Interaction履歴アクセス機能

前のInteractionの情報にアクセス可能：

```typescript
// SlashCommand → Modal の連携例
class ShowModalCommand implements ISlashCommand {
  async execute(interaction: SlashCommandInteraction): Promise<InteractionResponse> {
    // 現在のinteractionは自動的にキャッシュされる
    return await interaction.showModal(SayCommandModal)
  }
}

class SayCommandModal implements IModalComponent {
  async execute(interaction: ModalInteraction): Promise<InteractionResponse> {
    // 前のinteraction（SlashCommand）の情報にアクセス
    const previousInteraction = await interaction.getPreviousInteraction()
    const originalUser = previousInteraction?.user
    const originalChannel = previousInteraction?.channel

    // 元のコマンド実行者の情報を活用
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: `${originalUser.displayName}さんのコマンドから実行されました` }
    }
  }
}
```

## 3. アーキテクチャ設計

### 3.1 OOPベース設計要件

**Factoryパターンの廃止**: 従来のFactoryパターンによるクライアント生成を廃止し、OOPベースの直接クラス使用を採用します。

#### 3.1.1 設計原則

1. **Single Responsibility Principle**: 各クラスは単一の責任を持つ
2. **Open/Closed Principle**: 拡張に対しては開放、修正に対しては閉鎖
3. **Liskov Substitution Principle**: 基底クラスと派生クラスの置換可能性
4. **Interface Segregation Principle**: クライアントが利用しないインターフェースに依存させない
5. **Dependency Inversion Principle**: 上位レベルのモジュールは下位レベルのモジュールに依存しない

#### 3.1.2 クラス設計要件

```typescript
// 基底クラス
abstract class BaseDiscordClient {
  protected config: ClientConfig
  abstract rest: RestClient
  abstract gateway?: GatewayClient
}

// ランタイム固有クラス（直接使用）
class NodeDiscordClient extends BaseDiscordClient
class CloudflareDiscordClient extends BaseDiscordClient
class DenoDiscordClient extends BaseDiscordClient
```

### 3.2 コアアーキテクチャ

**モジュラー設計**を採用し、各機能を独立したコンポーネントとして実装

```text
discord-universal-sdk/
├── core/                    # コアモジュール
│   ├── client/             # クライアント基底
│   ├── rest/               # REST API クライアント
│   ├── gateway/            # Gateway API クライアント
│   └── types/              # 共通型定義
├── interaction/            # Interaction処理
│   ├── gateway/            # Gateway経由Interaction
│   ├── webhook/            # Webhook経由Interaction
│   └── handlers/           # 共通ハンドラー
├── components/             # UIコンポーネント
├── adapters/              # フレームワークアダプター
└── utils/                 # ユーティリティ
```

### 3.2 採用するGoFデザインパターン

#### 3.2.1 Strategy Pattern

Interaction受信方式の切り替え

```typescript
interface InteractionStrategy {
  setup(): Promise<void>
  handle(data: unknown): Promise<InteractionResponse>
}

class GatewayInteractionStrategy implements InteractionStrategy
class WebhookInteractionStrategy implements InteractionStrategy
```

#### 3.2.2 Factory Pattern

ランタイム固有クライアント

```typescript
interface DiscordClient {
  rest: RestClient
  gateway?: GatewayClient
}

// ランタイム別の直接クラス使用
class NodeDiscordClient implements DiscordClient
class CloudflareDiscordClient implements DiscordClient
class DenoDiscordClient implements DiscordClient
```

#### 3.2.3 Adapter Pattern

フレームワーク間の差異吸収

```typescript
interface FrameworkAdapter {
  parseRequest(req: unknown): InteractionRequest
  createResponse(data: InteractionResponse): unknown
}

class HonoAdapter implements FrameworkAdapter
class NextJSAdapter implements FrameworkAdapter
```

#### 3.2.4 Command Pattern

Interactionコマンドの管理

```typescript
interface InteractionCommand {
  execute(interaction: Interaction): Promise<void>
}

class InteractionManager {
  register(command: InteractionCommand): void
  handle(interaction: Interaction): Promise<void>
}
```

#### 3.2.5 Observer Pattern

イベント通知システム

```typescript
interface EventObserver<T> {
  notify(event: T): void
}

class EventEmitter<T> {
  subscribe(observer: EventObserver<T>): void
  emit(event: T): void
}
```

## 4. 機能要件

### 4.1 コア機能

#### 4.1.1 REST API クライアント

- **率制限管理**: 自動的なレート制限処理
- **エラーハンドリング**: 統一されたエラー処理
- **リトライ機能**: 指数バックオフによる自動リトライ
- **タイプセーフ**: 完全な型安全性

#### 4.1.2 Gateway API クライアント

- **自動再接続**: 接続断時の自動復旧
- **シャーディング**: 大規模BOT向けシャード管理
- **Heartbeat管理**: 自動ハートビート処理

#### 4.1.3 Interaction システム

- **デュアル受信**: Gateway/Webhook両方式対応
- **ハンドラー統一**: 受信方式に関係ない統一ハンドラー
- **型安全なルーティング**: 完全に型付けされたコマンドルーティング

### 4.2 コンポーネントシステム

#### 4.2.1 メッセージコンポーネント

Builderパターンを廃止し、型安全なオブジェクト構造を採用。mopo-discordjsスタイルの直感的なコンポーネント定義を実現。

#### 4.2.2 オブジェクト指向コンポーネント設計

**設計思想**: TypeScriptのオブジェクト指向を最大限活用し、interfaceとクラス実装による型安全で再利用可能な設計

**アプローチ**: Interface定義 + クラス実装 + 継承による拡張性

```typescript
// ✅ オブジェクト指向設計（クラスベース・簡素化）
export interface IButtonComponent {
  readonly customId: string
  readonly label: string
  readonly style: ButtonStyle

  execute(interaction: ButtonInteraction): Promise<InteractionResponse>
}

export class ConfirmButton implements IButtonComponent {
  public readonly id = 'confirm-button'
  public readonly customId = 'confirm-action'
  public readonly label = 'Confirm'
  public readonly style = ButtonStyle.Success

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'Confirmed!' }
    }
  }

  create(): MessageComponent {
    return {
      type: ComponentType.Button,
      style: this.style,
      label: this.label,
      custom_id: this.customId
    }
  }

  clone(): IButtonComponent {
    return new ConfirmButton()
  }
}

// 同じクラス内で完全に型安全な参照が可能
const button = new ConfirmButton()
const customId = button.customId  // 型安全
const label = button.label        // 型安全
```

#### 4.2.3 オブジェクト指向による継承と拡張

```typescript
// 基底クラスによる共通機能の提供
export abstract class BaseButton implements IButtonComponent {
  public abstract readonly id: string
  public abstract readonly customId: string
  public abstract readonly label: string
  public readonly style: ButtonStyle = ButtonStyle.Primary

  abstract execute(interaction: ButtonInteraction): Promise<InteractionResponse>

  create(): MessageComponent {
    return {
      type: ComponentType.Button,
      style: this.style,
      label: this.label,
      custom_id: this.customId,
      disabled: false
    }
  }

  clone(): IButtonComponent {
    return Object.create(Object.getPrototypeOf(this))
  }
}

// 継承による具象実装
export class DeleteButton extends BaseButton {
  public readonly id = 'delete-button'
  public readonly customId = 'confirm-delete'
  public readonly label = 'Delete'
  public readonly style = ButtonStyle.Danger

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    // 削除確認処理
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Item deleted successfully!',
        flags: MessageFlags.Ephemeral
      }
    }
  }
}

// モーダルコンポーネントの実装例
export interface IModalComponent {
  readonly id: string
  readonly customId: string
  readonly title: string
  readonly components: readonly ITextInputComponent[]

  execute(interaction: ModalInteraction): Promise<InteractionResponse>
  create(): MessageComponent
}

export interface ITextInputComponent {
  readonly customId: string
  readonly label: string
  readonly style: TextInputStyle
  readonly minLength?: number
  readonly placeholder?: string
}

export class SayCommandModal implements IModalComponent {
  public readonly id = 'say-command-modal'
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
    if (!interaction.channel || interaction.channel.isDMBased()) {
      throw new Error('このコマンドはサーバーでのみ使用できます')
    }

    // 同じクラス内のcomponentsから型安全に参照
    const messageContent = interaction.fields.getTextInputValue(
      this.components[0].customId  // ← 完全に型安全！
    )

    await interaction.channel.send({ content: messageContent })

    return {
      type: InteractionResponseType.UpdateMessage,
      data: { content: 'Success!!' }
    }
  }

  create(): MessageComponent {
    return {
      type: ComponentType.Modal,
      title: this.title,
      custom_id: this.customId,
      components: this.components.map(comp => ({
        type: ComponentType.ActionRow,
        components: [{
          type: ComponentType.TextInput,
          custom_id: comp.customId,
          label: comp.label,
          style: comp.style,
          min_length: comp.minLength,
          placeholder: comp.placeholder
        }]
      }))
    }
  }
}
```

#### 4.2.4 抽象クラスによるテンプレートメソッドパターン

```typescript
// Template Method Pattern の活用
export abstract class BaseConfirmationButton extends BaseButton {
  public readonly style = ButtonStyle.Danger

  // テンプレートメソッド
  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    const confirmed = await this.confirm(interaction)
    if (confirmed) {
      return await this.onConfirm(interaction)
    } else {
      return await this.onCancel(interaction)
    }
  }

  // 子クラスで実装する抽象メソッド
  protected abstract onConfirm(interaction: ButtonInteraction): Promise<InteractionResponse>

  // デフォルト実装（オーバーライド可能）
  protected async confirm(interaction: ButtonInteraction): Promise<boolean> {
    return true // 実際は追加確認ロジック
  }

  protected async onCancel(interaction: ButtonInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Operation cancelled.',
        flags: MessageFlags.Ephemeral
      }
    }
  }
}

// 具象実装（シンプル）
export class DeleteUserButton extends BaseConfirmationButton {
  public readonly id = 'delete-user-button'
  public readonly customId = 'delete-user'
  public readonly label = 'Delete User'

  protected async onConfirm(interaction: ButtonInteraction): Promise<InteractionResponse> {
    // ユーザー削除ロジック
    await this.deleteUser(interaction)
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'User deleted successfully!' }
    }
  }

  private async deleteUser(interaction: ButtonInteraction): Promise<void> {
    // 実際の削除処理
  }
}
```

#### 4.2.5 統一されたInteraction管理

```typescript
// InteractionManagerによる統一管理（ComponentManager廃止）
export class InteractionManager {
  private commands = new Map<string, ISlashCommand>()
  private components = new Map<string, IComponent>()

  register<T extends IInteractionHandler>(HandlerClass: new () => T): void {
    const handler = new HandlerClass()

    if ('name' in handler) {
      // スラッシュコマンド
      this.commands.set(handler.name, handler as ISlashCommand)
    } else if ('customId' in handler) {
      // コンポーネント
      this.components.set(handler.customId, handler as IComponent)
    }
  }

  async handle(interaction: Interaction): Promise<InteractionResponse> {
    // 統一されたInteraction処理
  }
}

// 使用例（クラスを直接指定）
const interactionManager = new InteractionManager()
interactionManager.register(HelloCommand)
interactionManager.register(ConfirmButton)

// メッセージ作成（簡素化）
const message = {
  content: 'Choose an action:',
  components: [
    {
      type: ComponentType.ActionRow,
      components: [ConfirmButton, DeleteButton]  // クラスを直接指定
    }
  ]
}
```

#### 4.2.6 実装時の配慮事項

##### 型安全性の確保

- Interface駆動開発による設計時の型安全性確保
- クラス実装による実行時型チェック
- Generic型とConstraintsを活用した柔軟な型定義
- Template Literal Typesの**必要最小限**の使用（型推論パフォーマンス重視）

##### パフォーマンス最適化

- クラスインスタンスの適切なライフサイクル管理
- Singletonパターンによるコンポーネント再利用
- 遅延初期化（Lazy Loading）による起動時間短縮
- メモリリークを防ぐ適切なオブジェクト破棄

##### 開発者体験の向上

- IDEでの強力な型補完とIntelliSense
- 抽象クラスによるテンプレート提供
- デコレーターを活用したメタデータ管理
- 実行時エラーの詳細情報とデバッグ支援

#### 4.2.7 推奨実装パターン

##### クラス設計のベストプラクティス

```typescript
// ✅ 推奨: Interface + 抽象クラス + 具象クラス
export interface ICommand {
  readonly name: string
  readonly description: string
  execute(interaction: CommandInteraction): Promise<InteractionResponse>
}

export abstract class BaseCommand implements ICommand {
  public abstract readonly name: string
  public abstract readonly description: string

  // 共通の前処理・後処理
  async execute(interaction: CommandInteraction): Promise<InteractionResponse> {
    await this.beforeExecute(interaction)
    const result = await this.doExecute(interaction)
    await this.afterExecute(interaction, result)
    return result
  }

  protected abstract doExecute(interaction: CommandInteraction): Promise<InteractionResponse>
  protected async beforeExecute(interaction: CommandInteraction): Promise<void> {}
  protected async afterExecute(interaction: CommandInteraction, result: InteractionResponse): Promise<void> {}
}

export class PingCommand extends BaseCommand {
  public readonly name = 'ping'
  public readonly description = 'Pong!'

  protected async doExecute(interaction: CommandInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'Pong!' }
    }
  }
}
```

### 4.3 キャッシュシステム

#### 4.3.1 オプショナルキャッシュとデータ永続化戦略

```typescript
// 統一インターフェース
export interface PersistenceAdapter {
  required: boolean
  capabilities: PersistenceCapability[]
  setup(config: PersistenceConfig): Promise<void>
}

export enum PersistenceCapability {
  CACHE = 'cache',
  PERSISTENT_STORAGE = 'persistent_storage',
  TRANSACTION = 'transaction'
}

// CloudflareWorkers用の実装
export class CloudflarePersistenceAdapter implements PersistenceAdapter {
  required = true // CloudflareではDB接続が必須
  capabilities = [
    PersistenceCapability.CACHE,
    PersistenceCapability.PERSISTENT_STORAGE
  ]

  async setup(config: CloudflarePersistenceConfig): Promise<void> {
    // KV/D1/Durable Objects 接続設定
  }
}

// Node.js用の実装
export class NodePersistenceAdapter implements PersistenceAdapter {
  required = false // Node.jsではオプショナル
  capabilities = [
    PersistenceCapability.CACHE,
    PersistenceCapability.PERSISTENT_STORAGE,
    PersistenceCapability.TRANSACTION
  ]
}

const client = new DiscordClient({
  cache: {
    messages: { enabled: true, maxSize: 1000 },
    users: { enabled: false },
    guilds: { enabled: true, ttl: 3600 }
  },
  persistence: new CloudflarePersistenceAdapter()
})
```

## 5. 非機能要件

### 5.1 パフォーマンス目標

- **起動時間**: 100ms以下での初期化
- **メモリ使用量**: Discord.jsの50%以下
- **バンドルサイズ**: Tree-shakingにより使用機能のみ含む

### 5.2 信頼性

- **エラー処理**: 包括的なエラーハンドリング
- **フォールト トレラント**: 部分的な機能停止でも動作継続
- **テストカバレッジ**: 95%以上のテストカバレッジ

### 5.3 保守性

- **モジュラー設計**: 各モジュールの独立性
- **型安全性**: 完全なTypeScript対応
- **ドキュメント**: 統一されたドキュメント体系

## 6. 技術仕様

### 6.1 プログラミング言語

- **TypeScript** (Primary)
- **JavaScript** (互換性維持)

### 6.2 依存関係

- **最小限の依存**: 外部依存を可能な限り削減
- **ポリフィル**: 必要に応じたランタイム固有ポリフィル
- **型定義**: 完全な型定義提供

### 6.3 ビルドシステム

- **ESM**: ES Modulesを基本とする
- **CJS**: CommonJS互換性維持
- **Tree-shaking**: 未使用コードの自動除去

## 7. 開発フェーズ

### Phase 1: コア開発 (1-2ヶ月)

- REST APIクライアント
- 基本型定義
- エラーハンドリング

### Phase 2: Gateway実装 (1ヶ月)

- Gateway APIクライアント
- イベントシステム
- 接続管理

### Phase 3: Interaction システム (1ヶ月)

- Gateway Interaction
- Webhook Interaction
- ハンドラー統一化

### Phase 4: コンポーネント (1ヶ月)

- メッセージコンポーネント
- UI コンポーネント
- 型安全な構造

### Phase 5: アダプター開発 (1ヶ月)

- フレームワークアダプター
- ランタイム最適化
- 統合テスト

### Phase 6: ドキュメント・最終調整 (1ヶ月)

- ドキュメント作成
- パフォーマンス最適化
- 安定化

## 8. 成功指標

### 8.1 技術指標

- **起動時間**: Discord.jsの50%以下
- **メモリ使用量**: Discord.jsの50%以下
- **バンドルサイズ**: 使用機能のみで100KB以下

### 8.2 利用性指標

- **学習コスト**: チュートリアル完了時間30分以下
- **移行コスト**: Discord.jsからの移行時間1日以下
- **コミュニティ**: 6ヶ月で100スター獲得

## 9. リスク分析

### 9.1 技術リスク

- **Discord API変更**: 頻繁なAPI変更への対応
- **ランタイム差異**: ランタイム間の機能差異
- **パフォーマンス**: 目標性能の達成

### 9.2 緩和策

- **モジュラー設計**: API変更の影響を局所化
- **アダプターパターン**: ランタイム差異の吸収
- **継続的最適化**: パフォーマンス監視と改善

## 10. 結論

本要件定義書に基づき、現行Discord.jsの課題を解決し、現代的な開発環境に適応した次世代Discordライブラリを開発する。特に、コンポーネントの再利用性、型安全性、マルチランタイム対応を重視し、開発者にとって使いやすく効率的なライブラリを目指す。

## ドキュメント同期運用ルール

**重要**: 要件や設計を変更する際は、関連するすべてのドキュメントと図を必ず同期させること：

1. **要件変更時**: REQUIREMENTS.md → DESIGN.md → ARCHITECTURE.md の図更新
2. **設計変更時**: DESIGN.md → ARCHITECTURE.md のクラス図・シーケンス図更新
3. **新機能追加時**: 全ドキュメント + Mermaid図の追加・更新
4. **確認手順**: 変更後、README.md の関連ドキュメントリンクから全体整合性を確認

## 関連ドキュメント

- [詳細設計仕様書](./DESIGN.md) - 具体的な実装アーキテクチャと設計パターン
- [システム設計図](./ARCHITECTURE.md) - Mermaidによるシステム構成とシーケンス図
- [プロジェクト要約](./PROJECT_SUMMARY.md) - 全体要約と進捗状況
