# Discord Universal SDK - 設計概要

## プロジェクト方針

**重要:** Discord Universal SDKは**完全新規設計**のライブラリです。Discord.jsとの後方互換性は提供せず、新しいアーキテクチャとAPIデザインにより、既存の課題を根本的に解決します。

### OOPベース設計の採用

**Factory パターンの廃止**: 従来のFactoryパターンによるクライアント生成を廃止し、**直接クラスインスタンス化**によるOOPベース設計を採用しています。

#### OOPベース設計の利点

1. **型安全性の向上**: クラス型による強固な型チェック
2. **コードの可読性**: 使用するクラスが明確で意図が伝わりやすい
3. **IDE支援**: インテリセンスとコード補完の精度向上
4. **拡張性**: クラス継承による機能拡張が容易
5. **テスタビリティ**: 具象クラスによるモック作成が簡単

```typescript
// ✅ OOPベース設計（推奨）
import { NodeDiscordClient, CloudflareDiscordClient } from 'discord-universal-sdk'

// ランタイム固有のクラスを直接使用
const nodeClient = new NodeDiscordClient(config)
const cfClient = new CloudflareDiscordClient(config)
```

## 1. 基本設計コンセプト

### 1.1 ランタイム制約管理とエラーハンドリング

```typescript
// 統一されたランタイム制約管理
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

// 統一されたエラー分類
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
```

### 1.2 自動intents推定

使用するAPIに基づいてintentsを自動推定：

```typescript
// intentsは自動推定される
const client = new NodeDiscordClient({
  token: 'YOUR_BOT_TOKEN'
  // interactionManager.register()の内容から必要なintentsを自動判定
})
```

### 1.3 REST APIクライアント

```typescript
// core/rest/client.ts - REST APIクライアント
export class RestClient {
  private rateLimiter: RateLimiter
  private requestQueue: RequestQueue

  constructor(private token: string, private options: RestOptions) {
    this.rateLimiter = new RateLimiter()
    this.requestQueue = new RequestQueue()
  }

  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    return this.requestQueue.add(() => this.executeRequest<T>(endpoint, options))
  }
}
```

### 1.4 Strategy Pattern実装

```typescript
// interaction/strategies/base.ts
export interface InteractionStrategy {
  name: string
  setup(config: StrategyConfig): Promise<void>
  handle(data: RawInteractionData): Promise<InteractionResponse>
  teardown(): Promise<void>
}

// interaction/strategies/gateway.ts
export class GatewayInteractionStrategy implements InteractionStrategy {
  name = 'gateway'
  private gateway: GatewayClient

  async setup(config: GatewayStrategyConfig): Promise<void> {
    this.gateway = new GatewayClient(config.token, config.intents)
    await this.gateway.connect()

    this.gateway.on('INTERACTION_CREATE', (interaction) => {
      this.handle(interaction)
    })
  }

  async handle(data: RawInteractionData): Promise<InteractionResponse> {
    const interaction = new Interaction(data)
    return await this.processInteraction(interaction)
  }
}

// interaction/strategies/webhook.ts
export class WebhookInteractionStrategy implements InteractionStrategy {
  name = 'webhook'
  private server: WebServer

  async setup(config: WebhookStrategyConfig): Promise<void> {
    this.server = new WebServer(config.port, config.path)
    this.server.onRequest(async (req) => {
      if (this.verifySignature(req)) {
        return await this.handle(req.body)
      }
      throw new Error('Invalid signature')
    })
  }

  async handle(data: RawInteractionData): Promise<InteractionResponse> {
    const interaction = new Interaction(data)
    return await this.processInteraction(interaction)
  }
}
```

### 1.5 型安全なコンポーネント登録システム

```typescript
// 改善された型安全なコンポーネント登録
class InteractionManager {
  // 型安全なコンポーネント登録
  register<T extends IInteractionHandler>(
    HandlerClass: new () => T
  ): T extends ISlashCommand
    ? SlashCommandRegistration<T>
    : T extends IButtonComponent
    ? ButtonComponentRegistration<T>
    : ComponentRegistration<T>

  // CustomId衝突検出機能
  private validateCustomId(customId: string, component: IComponent): void {
    if (this.components.has(customId)) {
      const existing = this.components.get(customId)
      throw new DiscordUniversalError(
        ErrorSource.USER_INPUT,
        'CUSTOMID_COLLISION',
        `CustomId "${customId}" is already registered`,
        {
          newComponent: component.constructor.name,
          existingComponent: existing?.constructor.name,
          customId
        }
      )
    }
  }
}
```

### 1.6 コンポーネントライフサイクル管理

```typescript
// メモリリーク防止のためのライフサイクル管理
export class ComponentLifecycleManager {
  private static instances = new WeakMap<object, ComponentInstance>()

  static track<T extends IComponent>(component: T): T {
    const instance = new ComponentInstance(component)
    this.instances.set(component, instance)
    return component
  }

  static cleanup(component: IComponent): void {
    const instance = this.instances.get(component)
    instance?.dispose()
    this.instances.delete(component)
  }
}

class ComponentInstance {
  private readonly timeoutHandles = new Set<NodeJS.Timeout>()
  private readonly eventListeners = new Map<string, Function[]>()

  constructor(private component: IComponent) {}

  dispose(): void {
    // タイムアウトの清理
    this.timeoutHandles.forEach(handle => clearTimeout(handle))
    this.timeoutHandles.clear()

    // イベントリスナーの清理
    this.eventListeners.forEach((listeners, event) => {
      listeners.forEach(listener => {
        // イベント削除処理
      })
    })
    this.eventListeners.clear()
  }
}
```

### 1.7 ランタイム抽象化レイヤー

```typescript
// マルチランタイム統一インターフェース
export interface RuntimeAbstraction {
  fetch: FetchFunction
  setTimeout: SetTimeoutFunction
  crypto: CryptoFunction
  storage?: StorageFunction
  constraints: RuntimeConstraints
}

export class RuntimeDetector {
  static detect(): RuntimeAbstraction {
    // 実行環境の自動検出と統一インターフェース提供
    if (typeof Deno !== 'undefined') {
      return new DenoRuntimeAbstraction()
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      return new NodeRuntimeAbstraction()
    } else if (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Cloudflare')) {
      return new CloudflareRuntimeAbstraction()
    }
    throw new Error('Unsupported runtime environment')
  }
}
```

### 1.8 ランタイム固有クライアント実装

```typescript
// adapters/node/client.ts
export class NodeDiscordClient extends BaseClient {
  rest = new NodeRestClient(this.config.token)
  gateway = new NodeGatewayClient(this.config.token, this.config.intents)

  async connect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.connect()
    }
  }
}

// adapters/cloudflare/client.ts
export class CloudflareDiscordClient extends BaseClient {
  rest = new CloudflareRestClient(this.config.token)
  // CloudflareではGatewayは使用不可
  gateway = undefined

  createWebhookHandler(): WebhookHandler {
    return new CloudflareWebhookHandler(this.config)
  }
}
```

### 1.9 Adapter Pattern実装

```typescript
// adapters/framework/base.ts
export interface FrameworkAdapter<TRequest, TResponse> {
  parseRequest(req: TRequest): InteractionRequest
  createResponse(data: InteractionResponse): TResponse
  extractHeaders(req: TRequest): Record<string, string>
  extractBody(req: TRequest): string
}

// adapters/framework/hono.ts
export class HonoAdapter implements FrameworkAdapter<Context, Response> {
  parseRequest(c: Context): InteractionRequest {
    return {
      headers: Object.fromEntries(c.req.header()),
      body: await c.req.text(),
      method: c.req.method,
      url: c.req.url
    }
  }

  createResponse(data: InteractionResponse): Response {
    return c.json(data, 200)
  }

  extractHeaders(c: Context): Record<string, string> {
    return Object.fromEntries(c.req.header())
  }

  extractBody(c: Context): string {
    return c.req.text()
  }
}

// adapters/framework/nextjs.ts
export class NextJSAdapter implements FrameworkAdapter<NextRequest, NextResponse> {
  parseRequest(req: NextRequest): InteractionRequest {
    return {
      headers: Object.fromEntries(req.headers.entries()),
      body: await req.text(),
      method: req.method,
      url: req.url
    }
  }

  createResponse(data: InteractionResponse): NextResponse {
    return NextResponse.json(data)
  }
}
```

## 2. コンポーネント設計

### 2.1 型安全なメッセージコンポーネント

```typescript
// components/embed/types.ts
export interface MessageEmbed {
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  footer?: EmbedFooter
  image?: EmbedImage
  thumbnail?: EmbedThumbnail
  video?: EmbedVideo
  provider?: EmbedProvider
  author?: EmbedAuthor
  fields?: EmbedField[]
  type: EmbedType
}

export interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

export enum EmbedType {
  Rich = 'rich',
  Image = 'image',
  Video = 'video',
  Gifv = 'gifv',
  Article = 'article',
  Link = 'link'
}

// components/embed/builder.ts (Optional utility)
export class EmbedUtils {
  static fromJSON(json: APIEmbed): MessageEmbed {
    return {
      title: json.title,
      description: json.description,
      color: json.color,
      type: EmbedType.Rich,
      // ... その他のプロパティ
    }
  }

  static toJSON(embed: MessageEmbed): APIEmbed {
    return {
      title: embed.title,
      description: embed.description,
      color: embed.color,
      // ... その他のプロパティ
    }
  }

  static validate(embed: MessageEmbed): ValidationResult {
    const errors: string[] = []

    if (embed.title && embed.title.length > 256) {
      errors.push('Title must be 256 characters or less')
    }

    if (embed.description && embed.description.length > 4096) {
      errors.push('Description must be 4096 characters or less')
    }

    return { valid: errors.length === 0, errors }
  }
}
```

### 2.2 Message Components V2対応

```typescript
// components/message/types.ts
export interface MessageComponent {
  type: ComponentType
  style?: ButtonStyle | SelectMenuStyle
  label?: string
  emoji?: PartialEmoji
  custom_id?: string
  url?: string
  disabled?: boolean
  options?: SelectMenuOption[]
  placeholder?: string
  min_values?: number
  max_values?: number
  components?: MessageComponent[]
}

export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  StringSelect = 3,
  TextInput = 4,
  UserSelect = 5,
  RoleSelect = 6,
  MentionableSelect = 7,
  ChannelSelect = 8
}

// components/message/factory.ts
export class ComponentFactory {
  static button(options: ButtonOptions): MessageComponent {
    return {
      type: ComponentType.Button,
      style: options.style ?? ButtonStyle.Primary,
      label: options.label,
      custom_id: options.customId,
      url: options.url,
      disabled: options.disabled ?? false,
      emoji: options.emoji
    }
  }

  static actionRow(...components: MessageComponent[]): MessageComponent {
    return {
      type: ComponentType.ActionRow,
      components
    }
  }

  static stringSelect(options: StringSelectOptions): MessageComponent {
    return {
      type: ComponentType.StringSelect,
      custom_id: options.customId,
      placeholder: options.placeholder,
      min_values: options.minValues ?? 1,
      max_values: options.maxValues ?? 1,
      options: options.options,
      disabled: options.disabled ?? false
    }
  }
}

// 使用例
const button = ComponentFactory.button({
  label: 'Click me!',
  customId: 'my_button',
  style: ButtonStyle.Primary
})

const select = ComponentFactory.stringSelect({
  customId: 'my_select',
  placeholder: 'Choose an option...',
  options: [
    { label: 'Option 1', value: 'opt1' },
    { label: 'Option 2', value: 'opt2' }
  ]
})

const row = ComponentFactory.actionRow(button, select)
```

## 3. Interaction処理システム

### 3.1 統一ハンドラーシステム

```typescript
// interaction/handler/base.ts
export abstract class InteractionHandler<T extends Interaction = Interaction> {
  abstract type: InteractionType
  abstract customId?: string | RegExp

  abstract execute(interaction: T): Promise<InteractionResponse>

  matches(interaction: Interaction): boolean {
    if (interaction.type !== this.type) return false

    if (this.customId) {
      if (typeof this.customId === 'string') {
        return interaction.customId === this.customId
      } else {
        return this.customId.test(interaction.customId ?? '')
      }
    }

    return true
  }
}

// interaction/handler/command.ts
export class SlashCommandHandler extends InteractionHandler<ChatInputCommandInteraction> {
  type = InteractionType.ApplicationCommand

  constructor(
    private commandName: string,
    private executor: (interaction: ChatInputCommandInteraction) => Promise<InteractionResponse>
  ) {
    super()
  }

  matches(interaction: Interaction): boolean {
    return interaction.type === this.type &&
           interaction.isChatInputCommand() &&
           interaction.commandName === this.commandName
  }

  execute(interaction: ChatInputCommandInteraction): Promise<InteractionResponse> {
    return this.executor(interaction)
  }
}

// interaction/handler/button.ts
export class ButtonHandler extends InteractionHandler<ButtonInteraction> {
  type = InteractionType.MessageComponent

  constructor(
    customId: string | RegExp,
    private executor: (interaction: ButtonInteraction) => Promise<InteractionResponse>
  ) {
    super()
    this.customId = customId
  }

  execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    return this.executor(interaction)
  }
}

// interaction/manager.ts
export class InteractionManager {
  private slashCommands: Map<string, ISlashCommand> = new Map()
  private buttonComponents: Map<string, IButtonComponent> = new Map()
  private modalComponents: Map<string, IModalComponent> = new Map()

  register<T extends IInteractionHandler>(HandlerClass: new () => T): void {
    const handler = new HandlerClass()

    if ('name' in handler && typeof handler.name === 'string') {
      // スラッシュコマンド
      this.slashCommands.set(handler.name, handler as ISlashCommand)
    } else if ('customId' in handler) {
      // コンポーネント
      if (handler.type === 'button') {
        this.buttonComponents.set(handler.customId, handler as IButtonComponent)
      } else if (handler.type === 'modal') {
        this.modalComponents.set(handler.customId, handler as IModalComponent)
      }
    }
  }

  create<T extends IComponent>(ComponentClass: new () => T): MessageComponent {
    const component = new ComponentClass()
    return component.create()
  }

  async handle(interaction: Interaction): Promise<InteractionResponse> {
    switch (interaction.type) {
      case InteractionType.ApplicationCommand:
        const command = this.slashCommands.get(interaction.data.name)
        if (command) return await command.execute(interaction)
        break

      case InteractionType.MessageComponent:
        const button = this.buttonComponents.get(interaction.data.custom_id)
        if (button) return await button.execute(interaction)
        break

      case InteractionType.ModalSubmit:
        const modal = this.modalComponents.get(interaction.data.custom_id)
        if (modal) return await modal.execute(interaction)
        break
    }

    throw new Error(`No handler found for interaction`)
  }
}
```

### 3.2 オブジェクト指向コンポーネントアーキテクチャ

TypeScriptのOOPを最大限活用したInterface駆動設計

```typescript
// components/base.ts - 基本インターフェース
export interface IComponent {
  readonly id: string
  readonly customId: string
  readonly type: ComponentType

  execute(interaction: ComponentInteraction): Promise<InteractionResponse>
  create(): MessageComponent
  validate?(): boolean
}

export interface IButtonComponent extends IComponent {
  readonly label: string
  readonly style: ButtonStyle
  readonly emoji?: PartialEmoji
  readonly disabled?: boolean
  readonly url?: string

  clone(): IButtonComponent
}

export interface IModalComponent extends IComponent {
  readonly title: string
  readonly components: readonly ITextInputComponent[]
}

export interface ITextInputComponent {
  readonly customId: string
  readonly label: string
  readonly style: TextInputStyle
  readonly minLength?: number
  readonly maxLength?: number
  readonly required?: boolean
  readonly value?: string
  readonly placeholder?: string
}

// components/button/base.ts - 抽象基底クラス
export abstract class BaseButton implements IButtonComponent {
  public abstract readonly id: string
  public abstract readonly customId: string
  public abstract readonly label: string
  public readonly type = ComponentType.Button
  public readonly style: ButtonStyle = ButtonStyle.Primary
  public readonly emoji?: PartialEmoji
  public readonly disabled?: boolean
  public readonly url?: string

  abstract execute(interaction: ButtonInteraction): Promise<InteractionResponse>

  create(): MessageComponent {
    return {
      type: this.type,
      style: this.style,
      label: this.label,
      custom_id: this.customId,
      emoji: this.emoji,
      disabled: this.disabled,
      url: this.url
    }
  }

  clone(): IButtonComponent {
    return new (this.constructor as new () => BaseButton)()
  }

  validate(): boolean {
    return this.label.length > 0 && this.customId.length > 0
  }
}

// components/button/confirm.ts - 具象実装
export class ConfirmButton extends BaseButton {
  public readonly id = 'confirm-button'
  public readonly customId = 'confirm-action'
  public readonly label = 'Confirm'
  public readonly style = ButtonStyle.Success

  async execute(interaction: ButtonInteraction): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Action confirmed!',
        flags: MessageFlags.Ephemeral
      }
    }
  }
}

// components/modal/base.ts - モーダル基底クラス
export abstract class BaseModal implements IModalComponent {
  public abstract readonly id: string
  public abstract readonly customId: string
  public abstract readonly title: string
  public abstract readonly components: readonly ITextInputComponent[]
  public readonly type = ComponentType.Modal

  abstract execute(interaction: ModalInteraction): Promise<InteractionResponse>

  create(): MessageComponent {
    return {
      type: this.type,
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
          max_length: comp.maxLength,
          required: comp.required,
          value: comp.value,
          placeholder: comp.placeholder
        }]
      }))
    }
  }

  protected getInputValue(interaction: ModalInteraction, customId: string): string {
    return interaction.fields.getTextInputValue(customId)
  }

  validate(): boolean {
    return this.title.length > 0 &&
           this.customId.length > 0 &&
           this.components.length > 0
  }
}

// components/modal/say-command.ts - 具象モーダル実装
export class SayCommandModal extends BaseModal {
  public readonly id = 'say-command-modal'
  public readonly customId = 'command-sayCommandModal'
  public readonly title = 'SAYコマンド'

  public readonly components = [
    {
      customId: 'InputMessage',
      label: 'メッセージ内容',
      style: TextInputStyle.Paragraph,
      minLength: 1,
      placeholder: 'ここに入力された内容が発言されます。',
      required: true
    }
  ] as const

  async execute(interaction: ModalInteraction): Promise<InteractionResponse> {
    if (!interaction.channel || interaction.channel.isDMBased()) {
      throw new ComponentExecutionError('このコマンドはサーバーでのみ使用できます')
    }

    // 同じクラス内から型安全に参照
    const messageContent = this.getInputValue(
      interaction,
      this.components[0].customId  // ← 完全に型安全！
    )

    await interaction.channel.send({ content: messageContent })

    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        content: 'メッセージを送信しました！',
        flags: MessageFlags.Ephemeral
      }
    }
  }
}
```

## 3.3 コンポーネント間連携システム

複数のコンポーネント間でのデータ共有とコンテキスト管理

```typescript
// context/interaction.ts
export interface InteractionContext {
  parent?: Interaction
  data?: Record<string, any>
  user: User
  guild?: Guild
  channel?: Channel
}

export class ContextManager {
  private contexts = new Map<string, InteractionContext>()

  create(interaction: Interaction): InteractionContext {
    const contextId = `${interaction.user.id}-${Date.now()}`
    const context: InteractionContext = {
      parent: interaction,
      data: {},
      user: interaction.user,
      guild: interaction.guild,
      channel: interaction.channel
    }

    this.contexts.set(contextId, context)
    return context
  }

  get(contextId: string): InteractionContext | undefined {
    return this.contexts.get(contextId)
  }

  update(contextId: string, data: Record<string, any>): void {
    const context = this.contexts.get(contextId)
    if (context) {
      context.data = { ...context.data, ...data }
    }
  }
}

// 使用例: 複数ステップのInteraction
export const CreateEventCommand = defineSlashCommand({
  id: 'create-event-command',
  name: 'create-event',
  description: 'イベントを作成します',
  execute: async (interaction, context) => {
    // 最初のモーダルを表示
    return {
      type: InteractionResponseType.Modal,
      data: CreateEventModal.create()
    }
  }
})

export const CreateEventModal = defineModal({
  id: 'create-event-modal',
  customId: 'create-event-step1',
  data: {
    title: 'イベント作成 - 基本情報',
    components: [
      {
        customId: 'event-name',
        label: 'イベント名',
        style: TextInputStyle.Short,
        required: true
      },
      {
        customId: 'event-description',
        label: 'イベント説明',
        style: TextInputStyle.Paragraph,
        required: true
      }
    ]
  },
  execute: async (interaction, context) => {
    // 入力データをコンテキストに保存
    const eventName = interaction.fields.getTextInputValue(
      CreateEventModal.data.components[0].customId
    )
    const eventDescription = interaction.fields.getTextInputValue(
      CreateEventModal.data.components[1].customId
    )

    context.data = {
      eventName,
      eventDescription
    }

    // 次のステップ（日時選択）へ
    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        content: `イベント「${eventName}」の詳細を設定してください`,
        components: [
          ComponentFactory.actionRow(
            DateTimeSelectButton.create(),
            CancelButton.create()
          )
        ]
      }
    }
  }
})

export const DateTimeSelectButton = defineButton({
  id: 'datetime-select-button',
  customId: 'select-datetime',
  data: {
    label: '日時を選択',
    style: ButtonStyle.Primary
  },
  execute: async (interaction, context) => {
    // 前のステップのデータにアクセス可能
    const { eventName, eventDescription } = context.data

    return {
      type: InteractionResponseType.Modal,
      data: DateTimeModal.create({
        title: `${eventName} - 日時設定`
      })
    }
  }
})

// コンポーネント群の管理
export class ComponentGroup {
  constructor(private components: ComponentDefinition[]) {}

  register(manager: InteractionManager): void {
    this.components.forEach(component => {
      manager.register(component)
    })
  }

  getComponent(id: string): ComponentDefinition | undefined {
    return this.components.find(comp => comp.id === id)
  }
}

// 関連コンポーネントをグループ化
export const EventCreationGroup = new ComponentGroup([
  CreateEventCommand,
  CreateEventModal,
  DateTimeSelectButton,
  DateTimeModal,
  ConfirmEventButton,
  CancelButton
])

// 一括登録
const interactionManager = new InteractionManager()
EventCreationGroup.register(interactionManager)
```

### 3.4 型安全なコンポーネントチェーン

```typescript
// chains/types.ts
export interface ComponentChain<TInput = any, TOutput = any> {
  execute(input: TInput, context: InteractionContext): Promise<TOutput>
  then<TNext>(next: ComponentChain<TOutput, TNext>): ComponentChain<TInput, TNext>
}

// chains/builder.ts
export class ChainBuilder {
  static create<T>(): ComponentChain<T, T> {
    return {
      execute: async (input: T) => input,
      then: function<TNext>(next: ComponentChain<T, TNext>) {
        return {
          execute: async (input: T, context: InteractionContext) => {
            const result = await this.execute(input, context)
            return await next.execute(result, context)
          },
          then: next.then.bind(next)
        }
      }
    }
  }
}

// 使用例: チェーン型のワークフロー
const eventCreationChain = ChainBuilder
  .create<{}>()
  .then(basicInfoStep)
  .then(dateTimeStep)
  .then(confirmationStep)
  .then(finalizeStep)

// チェーンの実行
await eventCreationChain.execute({}, context)
```
## 4. キャッシュシステム

### 4.1 カスタマイズ可能キャッシュ

```typescript
// cache/base.ts
export interface CacheStrategy<T> {
  get(key: string): T | undefined
  set(key: string, value: T, ttl?: number): void
  delete(key: string): boolean
  clear(): void
  size(): number
}

// cache/strategies/memory.ts
export class MemoryCacheStrategy<T> implements CacheStrategy<T> {
  private cache = new Map<string, { value: T; expiry?: number }>()
  private maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key)
    if (!item) return undefined

    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key)
      return undefined
    }

    return item.value
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    const expiry = ttl ? Date.now() + (ttl * 1000) : undefined
    this.cache.set(key, { value, expiry })
  }
}

// cache/manager.ts
export class CacheManager {
  private caches = new Map<string, CacheStrategy<any>>()

  register<T>(name: string, strategy: CacheStrategy<T>): void {
    this.caches.set(name, strategy)
  }

  get<T>(name: string): CacheStrategy<T> | undefined {
    return this.caches.get(name)
  }

  // 便利メソッド
  getUser(id: string): User | undefined {
    return this.get<User>('users')?.get(id)
  }

  setUser(user: User, ttl?: number): void {
    this.get<User>('users')?.set(user.id, user, ttl)
  }
}
```

## 5. エラーハンドリングシステム

### 5.1 統一エラーシステム

```typescript
// errors/base.ts
export abstract class DiscordError extends Error {
  abstract code: string
  abstract status?: number

  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = this.constructor.name
  }
}

// errors/api.ts
export class DiscordAPIError extends DiscordError {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message)
  }
}

export class RateLimitError extends DiscordAPIError {
  constructor(
    public retryAfter: number,
    message = 'Rate limit exceeded'
  ) {
    super('RATE_LIMITED', message, 429)
  }
}

// errors/handler.ts
export class ErrorHandler {
  private handlers = new Map<string, (error: DiscordError) => void>()

  register(errorCode: string, handler: (error: DiscordError) => void): void {
    this.handlers.set(errorCode, handler)
  }

  handle(error: DiscordError): void {
    const handler = this.handlers.get(error.code)
    if (handler) {
      handler(error)
    } else {
      // デフォルトエラーハンドリング
      console.error(`Unhandled Discord error: ${error.code}`, error)
    }
  }
}
```

この詳細設計仕様書では、あなたが指定した要件を満たすアーキテクチャを具体的に実装する方法を示しています。特に重要なポイント：

1. **Strategy Pattern**: Interaction受信方式（Gateway/Webhook）の切り替え
2. **Factory Pattern**: ランタイム別クライアント生成
3. **Adapter Pattern**: フレームワーク間の差異吸収
4. **コンポーネント統合**: 1つの場所でコンポーネントとハンドラーを定義
5. **型安全性**: Builderパターンを廃止し、型安全なオブジェクト構造を採用

## ドキュメント同期運用ルール

**重要**: 設計変更時は以下を必ず実施：

1. **クラス構造変更**: ARCHITECTURE.md のクラス図を更新
2. **処理フロー変更**: ARCHITECTURE.md のシーケンス図を更新
3. **新コンポーネント追加**: システム全体図とコンポーネント図を更新
4. **API変更**: 使用例コードとREADME.md を同期更新

## 関連ドキュメント

- [要件定義書](./REQUIREMENTS.md) - プロジェクトの要件と制約
- [システム設計図](./ARCHITECTURE.md) - Mermaidによる視覚的アーキテクチャ

## 設計の重要な変更点

1. **エラーハンドリングの統一**: ErrorSourceによる分類と詳細なエラー情報
2. **Runtime制約の明示**: 各ランタイムの制約を統一的に管理
3. **型安全性の最適化**: Template Literal Typesの必要最小限使用
4. **コンポーネントライフサイクル**: メモリリーク防止とCustomId衝突検出
5. **データ永続化戦略**: ランタイム別の最適な永続化方法
6. **再利用性**: JSONベースのコンポーネント設計で再利用性を最大化

これらの設計により、Discord.jsの課題を解決し、モダンな開発環境に適応したライブラリを構築できます。
