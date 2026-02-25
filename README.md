# rhythm_draw

React + TypeScript + MediaPipe Hands를 사용한 카메라 기반 리듬게임입니다.

## 프로젝트 개요
- 입력 방식: 검지 끝 위치 + 손목 스냅(까딱)
- 목표: 검지 끝을 노트 원 안에 맞추고, 박자에 맞춰 손목 스냅으로 타격
- 렌더링: HTML Canvas 레이어 구조(배경 / 노트 / 파티클 / HUD)
- 추적: MediaPipe Hands 실시간 손 랜드마크

## 주요 기능
- 실시간 손 추적 (최대 2손)
- 비트맵 기반 노트 타이밍
- TAP + SWIPE 복합 판정
- 점수 / 콤보 / 정확도 시스템
- PERFECT / GOOD / BAD / MISS / WRONG 판정 피드백
- 판정 정확도 기반 노트별 히트 사운드
- 제스처 트리거 시네마틱 연출
- 내장 데모 트랙 및 쉬운 난이도 비트맵

## 조작 방법
- 검지 끝(landmark 8)을 노트 원 범위 안으로 이동
- 손목을 스냅(짧고 빠르게 까딱)하여 타격
- 타격 판정 조건:
  1. 검지 끝이 판정 범위 안에 있음
  2. 손목 스냅 트리거가 발생함
  3. 타이밍이 판정 윈도우 안에 있음

## 기술 스택
- React 18
- TypeScript
- Vite
- Zustand
- MediaPipe Hands (CDN 스크립트)

## 로컬 실행
```bash
npm install
npm run dev
```

브라우저에서 Vite 로컬 주소를 열고 카메라 권한을 허용하세요.

## 빌드
```bash
npm run build
```

## 폴더 구조
```text
src/
  audio/          # WebAudio 엔진
  core/           # beat engine, hand tracker, scoring
  hooks/          # 게임 루프 / 손 추적 훅
  rendering/      # 가이드 레이어, 파티클, 렌더러
  screens/        # 곡 선택 / 게임 / 결과 화면
  stores/         # Zustand 스토어
  types/          # 공용 TypeScript 타입
public/songs/     # 비트맵 및 곡 에셋
```

## 참고 사항
- 카메라 기반 인터랙션 실험 목적에 맞춰 구현되었습니다.
- 추적 품질은 카메라 FPS, 조명, 손 가시성에 영향을 받습니다.
- 공개 배포 시 음원 라이선스를 반드시 확인하세요.

## 라이선스
현재 라이선스 파일이 없습니다. 오픈소스 배포 전 LICENSE를 추가하세요.
