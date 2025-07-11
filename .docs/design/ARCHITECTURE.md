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
            ERROR[ErrorHandler]
            CONSTRAINT[ConstraintManager]
        end

        subgraph "Interaction Layer"
            MANAGER[InteractionManager]
            STRATEGY[InteractionStrategy]
            GSTRAT[GatewayStrategy]
            WSTRAT[WebhookStrategy]
            LIFECYCLE[ComponentLifecycle]
        end

        subgraph "Component Layer"
            CMANAGER[ComponentManager]
            ICOMP[IComponent]
            BUTTON[ButtonComponent]
            MODAL[ModalComponent]
            VALIDATION[CustomIdValidator]
        end

        subgraph "Adapter Layer"
            FADAPTER[FrameworkAdapter]
            HONO[HonoAdapter]
            NEXTJS[NextJSAdapter]
            EXPRESS[ExpressAdapter]
            PERSIST[PersistenceAdapter]
        end

        subgraph "Runtime Layer"
            RUNTIME[RuntimeDetector]
            ABSTRACTION[RuntimeAbstraction]
            NODE[NodeRuntime]
            DENO[DenoRuntime]
            CF[CloudflareRuntime]
        end
    end

    subgraph "External Services"
        DISCORD[Discord API]
        DB[(Database/KV)]
        CACHE[(Cache Store)]
        WEBHOOK[Webhook Endpoint]
    end

    APP --> CLIENT
    APP --> COMP
    APP --> CMD

    CLIENT --> REST
    CLIENT --> GATEWAY
    CLIENT --> ERROR
    CLIENT --> CONSTRAINT

    CLIENT --> MANAGER
    MANAGER --> STRATEGY
    MANAGER --> LIFECYCLE
    STRATEGY --> GSTRAT
    STRATEGY --> WSTRAT

    COMP --> CMANAGER
    COMP --> VALIDATION
    CMANAGER --> ICOMP
    ICOMP --> BUTTON
    ICOMP --> MODAL

    GSTRAT --> GATEWAY
    WSTRAT --> FADAPTER
    FADAPTER --> HONO
    FADAPTER --> NEXTJS
    FADAPTER --> EXPRESS
    FADAPTER --> PERSIST

    CLIENT --> RUNTIME
    RUNTIME --> ABSTRACTION
    ABSTRACTION --> NODE
    ABSTRACTION --> DENO
    ABSTRACTION --> CF

    REST --> DISCORD
    GATEWAY --> DISCORD
    PERSIST --> DB
    PERSIST --> CACHE
    WEBHOOK --> WSTRAT
```

## 4. ランタイム制約管理図

```mermaid
graph TD
    subgraph "Runtime Constraints"
        DETECT[RuntimeDetector]

        subgraph "Node.js Runtime"
            NODE_CONSTRAINTS[
                maxExecutionTime: ∞
                supportsLongRunning: true
                supportsFileSystem: true
                supportsWebSocket: true
            ]
        end

        subgraph "Cloudflare Workers"
            CF_CONSTRAINTS[
                maxExecutionTime: 10ms
                supportsLongRunning: true waitUntil
                supportsFileSystem: false
                supportsWebSocket: false
            ]
        end

        subgraph "Deno Runtime"
            DENO_CONSTRAINTS[
                maxExecutionTime: ∞
                supportsLongRunning: true
                supportsFileSystem: true
                supportsWebSocket: true
            ]
        end
    end

    subgraph "Constraint Validation"
        VALIDATE[ConstraintValidator]
        CHECK_TIME[Check Execution Time]
        CHECK_FEATURES[Check Feature Support]
        THROW_ERROR[Throw RuntimeConstraintError]
    end

    DETECT --> NODE_CONSTRAINTS
    DETECT --> CF_CONSTRAINTS
    DETECT --> DENO_CONSTRAINTS

    NODE_CONSTRAINTS --> VALIDATE
    CF_CONSTRAINTS --> VALIDATE
    DENO_CONSTRAINTS --> VALIDATE

    VALIDATE --> CHECK_TIME
    VALIDATE --> CHECK_FEATURES
    CHECK_TIME --> THROW_ERROR
    CHECK_FEATURES --> THROW_ERROR
```

## 5. データ永続化アーキテクチャ

```mermaid
graph TB
    subgraph "Persistence Layer"
        INTERFACE[PersistenceAdapter Interface]

        subgraph "Node.js Implementation"
            NODE_PERSIST[NodePersistenceAdapter]
            REDIS[(Redis)]
            POSTGRES[(PostgreSQL)]
            FILE_CACHE[File System Cache]
        end

        subgraph "Cloudflare Implementation"
            CF_PERSIST[CloudflarePersistenceAdapter]
            KV[(KV Storage)]
            D1[(D1 Database)]
            DURABLE[(Durable Objects)]
        end

        subgraph "Deno Implementation"
            DENO_PERSIST[DenoPersistenceAdapter]
            DENO_KV[(Deno KV)]
            DENO_FILE[File System]
        end
    end

    subgraph "Cache Management"
        CACHE_MANAGER[CacheManager]
        MEMORY_CACHE[Memory Cache]
        DISTRIBUTED_CACHE[Distributed Cache]
    end

    INTERFACE --> NODE_PERSIST
    INTERFACE --> CF_PERSIST
    INTERFACE --> DENO_PERSIST

    NODE_PERSIST --> REDIS
    NODE_PERSIST --> POSTGRES
    NODE_PERSIST --> FILE_CACHE

    CF_PERSIST --> KV
    CF_PERSIST --> D1
    CF_PERSIST --> DURABLE

    DENO_PERSIST --> DENO_KV
    DENO_PERSIST --> DENO_FILE

    CACHE_MANAGER --> MEMORY_CACHE
    CACHE_MANAGER --> DISTRIBUTED_CACHE
```

## 6. Interaction処理シーケンス図

### 6.1 Gateway方式でのInteraction処理

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

### 6.2 Webhook方式でのInteraction処理

```mermaid
sequenceDiagram
    participant USER as User
    participant DISCORD as Discord API
    participant WEBHOOK as Webhook Endpoint
    participant ADAPTER as FrameworkAdapter
    participant STRATEGY as WebhookStrategy
    participant MANAGER as InteractionManager
    participant COMP as Component

    USER->>DISCORD: スラッシュコマンド実行
    DISCORD->>WEBHOOK: POST /webhook
    WEBHOOK->>ADAPTER: parseRequest(req)
    ADAPTER->>STRATEGY: handle(interactionData)
    STRATEGY->>MANAGER: route(interaction)
    MANAGER->>COMP: execute(interaction)
    COMP-->>MANAGER: InteractionResponse
    MANAGER-->>STRATEGY: Response
    STRATEGY-->>ADAPTER: createResponse(data)
    ADAPTER-->>WEBHOOK: HTTP Response
    WEBHOOK-->>DISCORD: 200 OK + JSON
    DISCORD->>USER: レスポンス表示
```

### 6.3 エラーハンドリングフロー

```mermaid
sequenceDiagram
    participant COMP as Component
    participant ERROR as ErrorHandler
    participant CONSTRAINT as ConstraintManager
    participant LOG as Logger
    participant USER as User

    COMP->>COMP: execute() throws error
    COMP->>ERROR: DiscordUniversalError
    ERROR->>ERROR: classify error source
    ERROR->>CONSTRAINT: check runtime constraints
    CONSTRAINT-->>ERROR: constraint info
    ERROR->>LOG: log error with context
    ERROR->>ERROR: determine recovery strategy

    alt Can Retry
        ERROR->>COMP: retry with backoff
    else Use Fallback
        ERROR->>ERROR: fallback response
    else Propagate Error
        ERROR->>USER: user-friendly error message
    end
```

## 7. エラーハンドリングフロー図

```mermaid
flowchart TD
    START[Error Occurs]

    subgraph "Error Classification"
        CLASSIFY{Classify Error Source}
        API_ERROR[Discord API Error]
        LIB_ERROR[Library Internal Error]
        USER_ERROR[User Input Error]
        RUNTIME_ERROR[Runtime Constraint Error]
    end

    subgraph "Error Processing"
        CREATE_ERROR[Create DiscordUniversalError]
        ADD_CONTEXT[Add Context & Details]
        LOG_ERROR[Log Error with Source]
    end

    subgraph "Error Recovery"
        RETRY{Can Retry?}
        EXPONENTIAL[Exponential Backoff]
        FALLBACK[Use Fallback Strategy]
        PROPAGATE[Propagate to User]
    end

    START --> CLASSIFY
    CLASSIFY --> API_ERROR
    CLASSIFY --> LIB_ERROR
    CLASSIFY --> USER_ERROR
    CLASSIFY --> RUNTIME_ERROR

    API_ERROR --> CREATE_ERROR
    LIB_ERROR --> CREATE_ERROR
    USER_ERROR --> CREATE_ERROR
    RUNTIME_ERROR --> CREATE_ERROR

    CREATE_ERROR --> ADD_CONTEXT
    ADD_CONTEXT --> LOG_ERROR
    LOG_ERROR --> RETRY

    RETRY -->|Yes| EXPONENTIAL
    RETRY -->|No| FALLBACK
    EXPONENTIAL --> FALLBACK
    FALLBACK --> PROPAGATE
```

## 8. コンポーネントクラス階層図

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

    class ComponentLifecycleManager {
        -instances: WeakMap
        +track(component) T
        +cleanup(component) void
        +validateCustomId(customId, component) void
    }

    class CustomIdValidator {
        +validateUniqueness(customId) boolean
        +validateFormat(customId) boolean
        +generateSuggestions(customId) string[]
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
    ComponentManager --> ComponentLifecycleManager
    ComponentManager --> CustomIdValidator
    ComponentLifecycleManager --> IComponent
    CustomIdValidator --> IComponent
```

## 9. 関連ドキュメント

- [要件定義書](./REQUIREMENTS.md) - システム要件と目的
- [詳細設計仕様書](./DESIGN.md) - 実装アーキテクチャと設計パターン

### 設計整合性チェックポイント

- [ ] 設計仕様書のクラス構造がクラス図と一致しているか
- [ ] 処理フローの変更がシーケンス図に反映されているか
- [ ] 新しいコンポーネントがコンポーネント構成図に追加されているか
- [ ] README.mdの特徴説明と図の内容が一致しているか
