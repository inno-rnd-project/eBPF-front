# eBPF GPU Observability — Frontend
<img width="1757" height="835" alt="image" src="https://github.com/user-attachments/assets/599339f9-dbf8-4754-883d-8702d174b0ae" />

eBPF 기반 GPU 통합 Observability 시스템의 프론트엔드입니다. 커널 레벨에서 수집한 네트워크 지연·패킷 Drop 데이터와 GPU(DCGM) 메트릭을 클러스터 토폴로지 위에서 시각화합니다.

> **Phase 1 (eBPF 코어) 시각화 완료.** 모든 차트는 외부 차트 라이브러리 없이 커스텀 SVG로 구현되어 있으며, 데이터는 결정적(seeded) Mock으로 동작하므로 백엔드 없이도 전체 화면을 확인할 수 있습니다.

## 기술 스택

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS 4** (PostCSS)
- 차트: 의존성 없는 커스텀 SVG 컴포넌트 (`app/components/charts/`)
- 패키지 매니저: **pnpm**

## 시작하기

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

### 기타 스크립트

```bash
pnpm build   # 프로덕션 빌드 (standalone)
pnpm start   # 프로덕션 서버 실행
pnpm lint    # ESLint
```

## 화면 구성

좌측 사이드바 셸을 공유하는 5개 라우트로 구성됩니다.

| 경로 | 화면 | 내용 |
| --- | --- | --- |
| `/` | **Overview** | 클러스터 토폴로지 (노드 카드 + Pod 허니콤), Phase-1 KPI 스트립, Drop 알림 오버레이 |
| `/latency` | **Latency** (기능 1) | 커널 단계별 지연 분해, 히스토그램, Pod × 시간 히트맵 |
| `/drops` | **Drops** (기능 2) | `SKB_DROP_REASON` 막대/표, 타임라인, 히트맵, 토폴로지 오버레이, 이벤트 테이블 |
| `/interference` | **Interference** (기능 3·4·5) | 간섭 Top-N 리더보드, Pearson 상관 행렬, 방사형 영향 그래프 |
| `/gpu` | **GPU** (기능 6) | DCGM 게이지, GPU Idle 원인 누적 영역(PCIe vs TCP), PCIe↔TCP 산점도, 통합 타임라인 |

## 프로젝트 구조

```
app/
├─ layout.tsx              # 루트 셸 (사이드바 + 메인)
├─ page.tsx                # Overview
├─ latency|drops|interference|gpu/page.tsx
├─ components/
│  ├─ nav/Sidebar.tsx
│  ├─ charts/             # 재사용 SVG 차트 (Histogram, Heatmap, Gauge, ScatterPlot …)
│  └─ views/              # 라우트별 뷰 컴포넌트
└─ lib/
   ├─ k8s.ts / telemetry.ts        # 타입·헬퍼
   ├─ mock-cluster.ts / mock-telemetry.ts  # Mock 데이터 (get* 함수)
   └─ rng.ts                        # 결정적 seeded RNG
```

## 데이터 아키텍처 — 실데이터 연동

모든 데이터는 `app/lib/rng.ts`로 시드된 결정적 Mock이며, `BASE_NOW` 시각에 고정되어 SSR과 CSR 결과가 동일합니다.

실제 백엔드(Cilium/Hubble, Prometheus, DCGM Exporter, Go 에이전트)와 연동할 때는 다음 진입 함수만 교체하면 됩니다. **타입과 차트 컴포넌트는 그대로 유지됩니다.**

- `getCluster()` — `app/lib/mock-cluster.ts`
- `getLatency()` / `getDrops()` / `getInterference()` / `getGpu()` — `app/lib/mock-telemetry.ts`

## 배포 (Docker)

멀티스테이지 빌드로 Next.js standalone 이미지를 생성합니다 (비-root `node` 사용자로 실행).

```bash
docker build -t ebpf-front .
docker run -p 3000:3000 ebpf-front
```
