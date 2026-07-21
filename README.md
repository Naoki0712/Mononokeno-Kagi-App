# もののけの鍵

文化祭運営用WebアプリのGitHub Pages対応版です。

## GitHub Pagesで公開する

1. GitHubのリポジトリで `Settings` → `Secrets and variables` → `Actions` を開きます。
2. `Repository secrets` に次の2件を登録します。
   - `NEXT_PUBLIC_SUPABASE_URL`: SupabaseのProject URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: SupabaseのPublishable key（旧Anon keyでも可）
3. `Settings` → `Pages` → `Source` を `GitHub Actions` にします。
4. このプロジェクト一式をmainブランチへ追加します。
5. `Actions` の「Deploy Next.js to GitHub Pages」が成功すると公開されます。

公開URL: `https://naoki0712.github.io/Mononokeno-Kagi-App/`

## Supabase・Discord側の設定

Supabase Dashboardの `Authentication` → `URL Configuration` で、次を追加します。

- Site URL: `https://naoki0712.github.io/Mononokeno-Kagi-App/`
- Redirect URLs: `https://naoki0712.github.io/Mononokeno-Kagi-App/**`

Discord Developer PortalのOAuth2 Redirectsには、Supabase Dashboardに表示されるDiscord用Callback URLを登録します。GitHub PagesのURLを直接Discordへ登録するのではありません。

## 独自ドメインへ切り替える場合

`mononokeno-kagi.space` をGitHub Pagesへ設定した後は、`.github/workflows/deploy-pages.yml` の以下2行を空文字へ変更して再実行します。

```yaml
PAGES_BASE_PATH: ""
NEXT_PUBLIC_BASE_PATH: ""
```

SupabaseのSite URL・Redirect URLsも独自ドメインへ変更してください。

## ローカル確認

`.env.local` に `.env.example` と同じ項目を設定し、以下を実行します。

```bash
npm ci
npm run dev
```

ログインパスワードやSupabaseの`service_role`キーは、リポジトリやGitHub Secretsへ保存しないでください。
