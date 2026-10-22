# 유저 광고 제거

아카라이브 유저 광고를 숨기거나 차단 표시로 바꾸는 유저 스크립트입니다.

## 설치

설치 절차는 [아카 리프레셔 위키](https://github.com/lekakid/ArcaRefresher/wiki)를 따릅니다. 위키에서 스크립트 링크를 여는 자리에 아래 주소를 넣으면 됩니다.

```
https://raw.githubusercontent.com/abcdultra425/Useradremover/main/useradremover.user.js
```

Tampermonkey는 이 주소의 `@version`이 올라가면 같은 주소에서 새 버전을 받아 옵니다.

## 사용

아카라이브 화면 오른쪽 아래, 맨 위·맨 아래 버튼 바로 위에 작은 메뉴 버튼이 있습니다. 누르면 설정 창이 열립니다.

차단 단어는 한 줄에 하나씩 입력합니다. 광고가 아래 형태의 채널로 연결되고, 그 채널 이름에 입력한 단어가 들어 있으면 차단됩니다.

```
arca.live/b/<차단할 채널>/글번호
```

예를 들어 광고 링크가 `arca.live/b/example/12345`이면 차단 단어에 `example`을 넣습니다.
