import { IS_EMBEDDED, IS_STAGE } from './live/page';
import { StageFrame } from './live/StageFrame';
import { Dashboard } from './live/Dashboard';
import { useGame } from './game/useGame';
import { GameStage } from './game/GameStage';
import { GameControls } from './game/GameControls';

export default function App() {
  const game = useGame();

  // Trang cho TikTok LIVE Studio: chỉ có màn hình game
  if (IS_STAGE) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <StageFrame>
          <GameStage game={game} />
        </StageFrame>
      </div>
    );
  }

  // Trang điều khiển
  return (
    <Dashboard
      status={game.status}
      channelName={game.channelName}
      preview={
        // trong MyStudioLive khung xem trước nằm ở tab của app, không dựng thêm cảnh 3D thứ hai
        IS_EMBEDDED ? null : (
          <StageFrame maxHeight={window.innerHeight - 40}>
            <GameStage game={game} />
          </StageFrame>
        )
      }
      extra={<GameControls stageCount={game.stageCount} />}
    />
  );
}
