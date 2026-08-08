スクロール連動アニメーション HTML版
====================================

このフォルダ内のファイルだけで動作します。Node.jsは必要ありません。

サーバーへのアップロード
------------------------

360_webpage_html フォルダの「中身」を、Webサーバーの公開フォルダへ
階層を変えずにすべてアップロードしてください。

必要な構成:

index.html
styles.css
script.js
assets/
  media/
    scene-01.mp4
    scene-01.jpg
    scene-02.mp4
    scene-02.jpg
    scene-03.mp4
    scene-03.jpg

確認方法
--------

アップロード後、ブラウザで index.html のURLを開いてください。
ローカルでも index.html をダブルクリックして確認できます。

注意点
------

ファイル名とフォルダ階層を変更すると、動画やCSSが読み込めなくなります。
MP4のMIMEタイプは video/mp4、JavaScriptは text/javascript として配信してください。
