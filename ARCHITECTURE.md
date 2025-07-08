# Discord Universal SDK - システム設計図

## 1. システム全体アーキテクチャ

```mermaid
graph TB
    subgraph "Client Application"
        APP[Application Code]
        COMP[Components]
        CMD[Commands]
    end

    subgraph "Discord Universal SDK"
        subgraph "Core Layer"
            CLIENT[DiscordClient]
            REST[RestClient]
            GATEWAY[GatewayClient]
        end

        subgraph "Interaction Layer"
            MANAGER[InteractionManager]
            STRATEGY[InteractionStrategy]
            GSTRAT[GatewayStrategy]
            WSTRAT[WebhookStrategy]
        end

        subgraph "Component Layer"
            CMANAGER[ComponentManager]
            ICOMP[IComponent]
            BUTTON[ButtonComponent]
            MODAL[ModalComponent]
        end

        subgraph "Adapter Layer"
            FADAPTER[FrameworkAdapter]
            HONO[HonoAdapter]
            NEXTJS[NextJSAdapter]
            EXPRESS[ExpressAdapter]
        end

        subgraph "Runtime Layer"
            RUNTIME[RuntimeDetector]
            NODE[NodeRuntime]
            DENO[DenoRuntime]
            CF[CloudflareRuntime]
        end
    end

    subgraph "External Services"
        DISCORD[Discord API]
        WEBHOOK[Webhook Endpoint]
    end

    APP --> CLIENT
    APP --> COMP
    APP --> CMD

    CLIENT --> FACTORY
    FACTORY --> REST
    FACTORY --> GATEWAY

    CLIENT --> MANAGER
    MANAGER --> STRATEGY
    STRATEGY --> GSTRAT
    STRATEGY --> WSTRAT

    COMP --> CMANAGER
    CMANAGER --> ICOMP
    ICOMP --> BUTTON
    ICOMP --> MODAL

    GSTRAT --> GATEWAY
    WSTRAT --> FADAPTER
    FADAPTER --> HONO
    FADAPTER --> NEXTJS
    FADAPTER --> EXPRESS

    FACTORY --> RUNTIME
    RUNTIME --> NODE
    RUNTIME --> DENO
    RUNTIME --> CF

    REST --> DISCORD
    GATEWAY --> DISCORD
    WEBHOOK --> WSTRAT
```

## 2. コンポーネントクラス階層図

```mermaid
classDiagram
    class IComponent {
        <<interface>>
        +readonly id: string
        +readonly customId: string
        +readonly type: ComponentType
        +execute(interaction) Promise~InteractionResponse~
        +create() MessageComponent
        +validate() boolean
    }

    class IButtonComponent {
        <<interface>>
        +readonly label: string
        +readonly style: ButtonStyle
        +readonly emoji?: PartialEmoji
        +clone() IButtonComponent
    }

    class IModalComponent {
        <<interface>>
        +readonly title: string
        +readonly components: ITextInputComponent[]
    }

    class BaseButton {
        <<abstract>>
        +abstract readonly id: string
        +abstract readonly customId: string
        +abstract readonly label: string
        +readonly style: ButtonStyle
        +create() MessageComponent
        +clone() IButtonComponent
        +validate() boolean
        +execute(interaction)* Promise~InteractionResponse~
    }

    class BaseModal {
        <<abstract>>
        +abstract readonly id: string
        +abstract readonly customId: string
        +abstract readonly title: string
        +abstract readonly components: ITextInputComponent[]
        +create() MessageComponent
        +getInputValue(interaction, customId) string
        +validate() boolean
        +execute(interaction)* Promise~InteractionResponse~
    }

    class ConfirmButton {
        +readonly id: "confirm-button"
        +readonly customId: "confirm-action"
        +readonly label: "Confirm"
        +readonly style: ButtonStyle.Success
        +execute(interaction) Promise~InteractionResponse~
    }

    class DeleteButton {
        +readonly id: "delete-button"
        +readonly customId: "confirm-delete"
        +readonly label: "Delete"
        +readonly style: ButtonStyle.Danger
        +execute(interaction) Promise~InteractionResponse~
    }

    class SayCommandModal {
        +readonly id: "say-command-modal"
        +readonly customId: "command-sayCommandModal"
        +readonly title: "SAYコマンド"
        +readonly components: ITextInputComponent[]
        +execute(interaction) Promise~InteractionResponse~
    }

    class ComponentManager {
        -components: Map~string, IComponent~
        -instances: Map~Function, IComponent~
        +register(componentClass) void
        +get(componentClass) T
        +create(componentClass) MessageComponent
        +handle(interaction) Promise~InteractionResponse~
    }

    IComponent <|-- IButtonComponent
    IComponent <|-- IModalComponent
    IButtonComponent <|.. BaseButton
    IModalComponent <|.. BaseModal
    BaseButton <|-- ConfirmButton
    BaseButton <|-- DeleteButton
    BaseModal <|-- SayCommandModal
    ComponentManager --> IComponent
```

## 3. Interaction処理シーケンス図

### 3.1 Gateway方式でのInteraction処理

```mermaid
sequenceDiagram
    participant USER as User
    participant DISCORD as Discord API
    participant GATEWAY as GatewayClient
    participant STRATEGY as GatewayStrategy
    participant MANAGER as InteractionManager
    participant COMP as Component
    participant APP as Application

    USER->>DISCORD: スラッシュコマンド実行
    DISCORD->>GATEWAY: INTERACTION_CREATE Event
    GATEWAY->>STRATEGY: handle(interactionData)
    STRATEGY->>MANAGER: route(interaction)
    MANAGER->>COMP: execute(interaction)
    COMP->>APP: ビジネスロジック実行
    APP-->>COMP: 処理結果
    COMP-->>MANAGER: InteractionResponse
    MANAGER-->>STRATEGY: Response
    STRATEGY->>DISCORD: API Response
    DISCORD->>USER: レスポンス表示
```

### 3.2 Webhook方式でのInteraction処理

```mermaid
sequenceDiagram
    participant USER as User
    participant DISCORD as Discord API
    participant WEBHOOK as Webhook Endpoint
    participant ADAPTER as FrameworkAdapter
    participant STRATEGY as WebhookStrategy
    participant MANAGER as InteractionManager
    participant COMP as Component
    participant APP as Application

    USER->>DISCORD: スラッシュコマンド実行
    DISCORD->>WEBHOOK: POST /interactions
    WEBHOOK->>ADAPTER: parseRequest(req)
    ADAPTER->>STRATEGY: handle(interactionData)
    STRATEGY->>MANAGER: route(interaction)
    MANAGER->>COMP: execute(interaction)
    COMP->>APP: ビジネスロジック実行
    APP-->>COMP: 処理結果
    COMP-->>MANAGER: InteractionResponse
    MANAGER-->>STRATEGY: Response
    STRATEGY-->>ADAPTER: Response Data
    ADAPTER-->>WEBHOOK: HTTP Response
    WEBHOOK-->>DISCORD: 200 OK + Response
    DISCORD->>USER: レスポンス表示
```

## 4. コンポーネント登録・実行フロー

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant MANAGER as ComponentManager
    participant COMP as Component Class
    participant INSTANCE as Component Instance
    participant INTERACTION as Interaction

    Note over DEV: アプリケーション初期化時
    DEV->>MANAGER: register(ConfirmButton)
    MANAGER->>COMP: new ConfirmButton()
    COMP-->>INSTANCE: インスタンス生成
    MANAGER->>MANAGER: store(customId, instance)
    MANAGER->>MANAGER: store(class, instance)

    Note over DEV: メッセージ作成時
    DEV->>MANAGER: create(ConfirmButton)
    MANAGER->>MANAGER: get(ConfirmButton)
    MANAGER->>INSTANCE: create()
    INSTANCE-->>MANAGER: MessageComponent
    MANAGER-->>DEV: MessageComponent

    Note over DEV: Interaction受信時
    INTERACTION->>MANAGER: handle(interaction)
    MANAGER->>MANAGER: components.get(customId)
    MANAGER->>INSTANCE: execute(interaction)
    INSTANCE->>INSTANCE: ビジネスロジック
    INSTANCE-->>MANAGER: InteractionResponse
    MANAGER-->>INTERACTION: InteractionResponse
```

## 5. マルチランタイム対応アーキテクチャ

```mermaid
graph TB
    subgraph "Application Layer"
        APP[User Application]
    end

    subgraph "SDK Core"
        DETECTOR[RuntimeDetector]
    end

    subgraph "Runtime Implementations"
        subgraph "Node.js"
            NCLIENT[NodeDiscordClient]
            NREST[NodeRestClient]
            NGATEWAY[NodeGatewayClient]
        end

        subgraph "Deno"
            DCLIENT[DenoDiscordClient]
            DREST[DenoRestClient]
            DGATEWAY[DenoGatewayClient]
        end

        subgraph "Cloudflare Workers"
            CCLIENT[CloudflareDiscordClient]
            CREST[CloudflareRestClient]
            CWEBHOOK[CloudflareWebhookHandler]
        end

        subgraph "Bun"
            BCLIENT[BunDiscordClient]
            BREST[BunRestClient]
            BGATEWAY[BunGatewayClient]
        end
    end

    subgraph "External APIs"
        DISCORD[Discord API]
        WEBHOOK[Webhook Endpoints]
    end

    APP --> FACTORY
    FACTORY --> DETECTOR

    DETECTOR --> NCLIENT
    DETECTOR --> DCLIENT
    DETECTOR --> CCLIENT
    DETECTOR --> BCLIENT

    NCLIENT --> NREST
    NCLIENT --> NGATEWAY

    DCLIENT --> DREST
    DCLIENT --> DGATEWAY

    CCLIENT --> CREST
    CCLIENT --> CWEBHOOK

    BCLIENT --> BREST
    BCLIENT --> BGATEWAY

    NREST --> DISCORD
    DREST --> DISCORD
    CREST --> DISCORD
    BREST --> DISCORD

    NGATEWAY --> DISCORD
    DGATEWAY --> DISCORD
    BGATEWAY --> DISCORD

    CWEBHOOK --> WEBHOOK
```

## 6. フレームワークアダプター構成

```mermaid
graph LR
    subgraph "Framework Requests"
        HONO_REQ[Hono Context]
        NEXT_REQ[NextRequest]
        EXPRESS_REQ[Express Request]
        FASTIFY_REQ[Fastify Request]
    end

    subgraph "Adapter Layer"
        HONO_ADAPTER[HonoAdapter]
        NEXT_ADAPTER[NextJSAdapter]
        EXPRESS_ADAPTER[ExpressAdapter]
        FASTIFY_ADAPTER[FastifyAdapter]
    end

    subgraph "Unified Interface"
        INTERACTION_REQ[InteractionRequest]
        WEBHOOK_STRATEGY[WebhookStrategy]
        INTERACTION_RES[InteractionResponse]
    end

    subgraph "Framework Responses"
        HONO_RES[Hono Response]
        NEXT_RES[NextResponse]
        EXPRESS_RES[Express Response]
        FASTIFY_RES[Fastify Reply]
    end

    HONO_REQ --> HONO_ADAPTER
    NEXT_REQ --> NEXT_ADAPTER
    EXPRESS_REQ --> EXPRESS_ADAPTER
    FASTIFY_REQ --> FASTIFY_ADAPTER

    HONO_ADAPTER --> INTERACTION_REQ
    NEXT_ADAPTER --> INTERACTION_REQ
    EXPRESS_ADAPTER --> INTERACTION_REQ
    FASTIFY_ADAPTER --> INTERACTION_REQ

    INTERACTION_REQ --> WEBHOOK_STRATEGY
    WEBHOOK_STRATEGY --> INTERACTION_RES

    INTERACTION_RES --> HONO_ADAPTER
    INTERACTION_RES --> NEXT_ADAPTER
    INTERACTION_RES --> EXPRESS_ADAPTER
    INTERACTION_RES --> FASTIFY_ADAPTER

    HONO_ADAPTER --> HONO_RES
    NEXT_ADAPTER --> NEXT_RES
    EXPRESS_ADAPTER --> EXPRESS_RES
    FASTIFY_ADAPTER --> FASTIFY_RES
```

## 7. エラーハンドリングフロー

```mermaid
sequenceDiagram
    participant COMP as Component
    participant MANAGER as InteractionManager
    participant HANDLER as ErrorHandler
    participant LOGGER as Logger
    participant USER as User Response

    COMP->>COMP: execute(interaction)

    alt 正常処理
        COMP-->>MANAGER: InteractionResponse
        MANAGER-->>USER: Success Response
    else コンポーネントエラー
        COMP->>COMP: throw ComponentError
        COMP->>HANDLER: handleError(error)
        HANDLER->>LOGGER: logError(error)
        HANDLER->>HANDLER: generateErrorResponse()
        HANDLER-->>MANAGER: Error InteractionResponse
        MANAGER-->>USER: Error Response
    else バリデーションエラー
        COMP->>COMP: validate() -> false
        COMP->>HANDLER: handleValidationError()
        HANDLER-->>MANAGER: Validation Error Response
        MANAGER-->>USER: Validation Error
    else 予期しないエラー
        COMP->>COMP: throw UnexpectedError
        COMP->>HANDLER: handleUnexpectedError(error)
        HANDLER->>LOGGER: logCriticalError(error)
        HANDLER->>HANDLER: generateGenericError()
        HANDLER-->>MANAGER: Generic Error Response
        MANAGER-->>USER: Generic Error Message
    end
```

## 8. データ永続化・キャッシュシステム構成

```mermaid
graph TB
    subgraph "Application"
        CLIENT[DiscordClient]
        CONFIG[PersistenceConfig]
    end

    subgraph "Data Layer"
        MANAGER[DataManager]

        subgraph "Storage Strategies"
            MEMORY[MemoryCacheStrategy]
            PRISMA[PrismaKyselyStrategy]
            CUSTOM[CustomStorageStrategy]
        end

        subgraph "Data Types"
            USER_CACHE[UserData]
            GUILD_CACHE[GuildData]
            MESSAGE_CACHE[MessageData]
            CHANNEL_CACHE[ChannelData]
        end
    end

    subgraph "Storage"
        HEAP[Heap Memory]
        DATABASE[Database (SQLite/PostgreSQL/MySQL)]
        CUSTOM_STORE[Custom Storage]
    end

    CLIENT --> CONFIG
    CONFIG --> MANAGER

    MANAGER --> MEMORY
    MANAGER --> PRISMA
    MANAGER --> CUSTOM

    MANAGER --> USER_CACHE
    MANAGER --> GUILD_CACHE
    MANAGER --> MESSAGE_CACHE
    MANAGER --> CHANNEL_CACHE

    MEMORY --> HEAP
    PRISMA --> DATABASE
    CUSTOM --> CUSTOM_STORE

    USER_CACHE --> MEMORY
    GUILD_CACHE --> PRISMA
    MESSAGE_CACHE --> MEMORY
    CHANNEL_CACHE --> CUSTOM
```

## ドキュメント同期運用ルール

**重要**: このシステム設計図は要件定義書・詳細設計仕様書と密接に連携しています。

### 図の更新タイミング

1. **要件変更時**
   - システム全体図の更新
   - 新しいランタイムやフレームワーク対応の追加
   - キャッシュ戦略の変更反映

2. **設計変更時**
   - クラス図の更新（継承関係、インターフェース変更）
   - シーケンス図の更新（処理フロー変更）
   - コンポーネント構成図の更新

3. **実装変更時**
   - 実際のクラス構造に合わせたクラス図の調整
   - パフォーマンス最適化後のキャッシュ構成図更新

### 確認チェックリスト

- [ ] 要件定義書の変更内容がシステム全体図に反映されているか
- [ ] 設計仕様書のクラス構造がクラス図と一致しているか
- [ ] 処理フローの変更がシーケンス図に反映されているか
- [ ] 新しいコンポーネントがコンポーネント構成図に追加されているか
- [ ] README.mdの特徴説明と図の内容が一致しているか

関連ドキュメント：
- [要件定義書](./REQUIREMENTS.md) - システム要件と目的
- [詳細設計仕様書](./DESIGN.md) - 実装アーキテクチャと設計パターン
