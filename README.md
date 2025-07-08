# Discord Universal SDK

> [!TIPS]
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
- **軽量**: Discord.jsの50%以下のメモリ使用量
- **柔軟なキャッシュ**: オプショナル&カスタマイズ可能なキャッシュシステム

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

## �📝 ライセンス

MIT License (予定)
