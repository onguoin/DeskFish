(() => {
  const parameters = new URL(location.href).searchParams;
  const gameType = parameters.get("game") || "gomoku";
  const privacyToken = parameters.get("deskframe_token") || "";
  let gameVisible = parameters.get("deskframe_visible") === "1";

  const title = document.querySelector("#gameTitle");
  const score = document.querySelector("#score");
  const status = document.querySelector("#status");
  const help = document.querySelector("#help");
  const canvas = document.querySelector("#gameCanvas");
  const boardElement = document.querySelector("#tileBoard");
  const restartButton = document.querySelector("#restartButton");
  const undoButton = document.querySelector("#undoButton");
  const directionPad = document.querySelector("#directionPad");
  const context = canvas.getContext("2d");

  let restartGame = () => {};
  let undoMove = () => {};
  let visibilityChanged = () => {};
  let directionInput = () => {};

  function fitCanvas(aspectRatio) {
    const stage = canvas.parentElement;
    const availableWidth = Math.max(1, stage.clientWidth);
    const availableHeight = Math.max(1, stage.clientHeight);
    let width = availableWidth;
    let height = width / aspectRatio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspectRatio;
    }
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${Math.floor(width)}px`;
    canvas.style.height = `${Math.floor(height)}px`;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  function observeStage(render) {
    let frame = 0;
    const requestRender = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(requestRender);
    observer.observe(document.querySelector(".stage"));
    window.addEventListener("resize", requestRender);
  }

  function setText(element, value) {
    element.textContent = String(value);
  }

  function setupGomoku() {
    const size = 15;
    let cells = Array(size * size).fill(0);
    let history = [];
    let finished = false;
    let thinking = false;
    let geometry = { width: 0, height: 0, edge: 0, gap: 0 };

    title.textContent = "五子棋";
    help.textContent = "你执黑先行 · 点击棋盘落子";
    score.textContent = "15×15";
    undoButton.hidden = false;

    const at = (row, column) => cells[row * size + column];
    const setAt = (row, column, value) => { cells[row * size + column] = value; };

    function hasFive(row, column, player) {
      return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => {
        let count = 1;
        for (const direction of [-1, 1]) {
          let r = row + dr * direction;
          let c = column + dc * direction;
          while (r >= 0 && r < size && c >= 0 && c < size && at(r, c) === player) {
            count += 1;
            r += dr * direction;
            c += dc * direction;
          }
        }
        return count >= 5;
      });
    }

    function wouldWin(row, column, player) {
      setAt(row, column, player);
      const won = hasFive(row, column, player);
      setAt(row, column, 0);
      return won;
    }

    function linePotential(row, column, player, dr, dc) {
      let count = 1;
      let open = 0;
      for (const direction of [-1, 1]) {
        let r = row + dr * direction;
        let c = column + dc * direction;
        while (r >= 0 && r < size && c >= 0 && c < size && at(r, c) === player) {
          count += 1;
          r += dr * direction;
          c += dc * direction;
        }
        if (r >= 0 && r < size && c >= 0 && c < size && at(r, c) === 0) open += 1;
      }
      return (count ** 3) * (open + 1);
    }

    function candidateScore(row, column) {
      if (wouldWin(row, column, 2)) return 1_000_000;
      if (wouldWin(row, column, 1)) return 800_000;
      const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
      const attack = directions.reduce((sum, pair) => sum + linePotential(row, column, 2, ...pair), 0);
      const defense = directions.reduce((sum, pair) => sum + linePotential(row, column, 1, ...pair), 0);
      const center = 14 - Math.abs(7 - row) - Math.abs(7 - column);
      return attack * 1.08 + defense + center * 0.2 + Math.random() * 0.05;
    }

    function candidates() {
      if (!history.length) return [{ row: 7, column: 7 }];
      const result = [];
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          if (at(row, column)) continue;
          let nearby = false;
          for (let dr = -2; dr <= 2 && !nearby; dr += 1) {
            for (let dc = -2; dc <= 2; dc += 1) {
              const r = row + dr;
              const c = column + dc;
              if (r >= 0 && r < size && c >= 0 && c < size && at(r, c)) {
                nearby = true;
                break;
              }
            }
          }
          if (nearby) result.push({ row, column });
        }
      }
      return result;
    }

    function place(row, column, player) {
      setAt(row, column, player);
      history.push({ row, column, player });
      if (hasFive(row, column, player)) {
        finished = true;
        status.textContent = player === 1 ? "你赢了" : "电脑连成五子";
      } else if (history.length === size * size) {
        finished = true;
        status.textContent = "和棋";
      }
      draw();
    }

    function computerMove() {
      if (finished || !gameVisible) {
        thinking = false;
        return;
      }
      const move = candidates().sort((a, b) => candidateScore(b.row, b.column) - candidateScore(a.row, a.column))[0];
      thinking = false;
      if (!move) return;
      place(move.row, move.column, 2);
      if (!finished) status.textContent = "轮到你落子";
    }

    function draw() {
      const { width, height } = fitCanvas(1);
      const side = Math.min(width, height);
      const edge = side * 0.055;
      const gap = (side - edge * 2) / (size - 1);
      geometry = { width, height, edge, gap };
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#c7a66b";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#59462f";
      context.lineWidth = Math.max(0.7, side / 700);
      for (let index = 0; index < size; index += 1) {
        const position = edge + index * gap;
        context.beginPath();
        context.moveTo(edge, position);
        context.lineTo(side - edge, position);
        context.moveTo(position, edge);
        context.lineTo(position, side - edge);
        context.stroke();
      }
      [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(([row, column]) => {
        context.beginPath();
        context.arc(edge + column * gap, edge + row * gap, Math.max(1.5, gap * 0.09), 0, Math.PI * 2);
        context.fillStyle = "#59462f";
        context.fill();
      });
      history.forEach(({ row, column, player }, index) => {
        const x = edge + column * gap;
        const y = edge + row * gap;
        const radius = gap * 0.42;
        const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 1, x, y, radius);
        if (player === 1) {
          gradient.addColorStop(0, "#586068");
          gradient.addColorStop(1, "#11171c");
        } else {
          gradient.addColorStop(0, "#ffffff");
          gradient.addColorStop(1, "#b9c2c7");
        }
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
        if (index === history.length - 1) {
          context.beginPath();
          context.arc(x, y, Math.max(1.4, radius * 0.16), 0, Math.PI * 2);
          context.fillStyle = player === 1 ? "#65c7ce" : "#9b4f43";
          context.fill();
        }
      });
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (!gameVisible || finished || thinking) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const column = Math.round((x - geometry.edge) / geometry.gap);
      const row = Math.round((y - geometry.edge) / geometry.gap);
      if (row < 0 || row >= size || column < 0 || column >= size || at(row, column)) return;
      place(row, column, 1);
      if (!finished) {
        thinking = true;
        status.textContent = "电脑思考中…";
        window.setTimeout(computerMove, 180);
      }
    });

    restartGame = () => {
      cells = Array(size * size).fill(0);
      history = [];
      finished = false;
      thinking = false;
      status.textContent = "你执黑先行";
      draw();
    };
    undoMove = () => {
      if (thinking) return;
      const count = history.at(-1)?.player === 2 ? 2 : 1;
      history.splice(Math.max(0, history.length - count), count).forEach(({ row, column }) => setAt(row, column, 0));
      finished = false;
      status.textContent = "已悔棋 · 轮到你落子";
      draw();
    };
    visibilityChanged = () => {
      if (gameVisible && thinking) window.setTimeout(computerMove, 100);
    };
    observeStage(draw);
    restartGame();
  }

  function setup2048() {
    let cells = Array(16).fill(0);
    let points = 0;
    let finished = false;

    title.textContent = "2048";
    help.textContent = "方向键或下方按钮移动方块";
    canvas.hidden = true;
    boardElement.hidden = false;
    directionPad.hidden = false;
    undoButton.hidden = true;
    for (let index = 0; index < 16; index += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      boardElement.append(tile);
    }

    function addTile() {
      const empty = cells.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
      if (!empty.length) return;
      const index = empty[Math.floor(Math.random() * empty.length)];
      cells[index] = Math.random() < 0.9 ? 2 : 4;
    }

    function slide(line) {
      const values = line.filter(Boolean);
      const result = [];
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] === values[index + 1]) {
          const merged = values[index] * 2;
          result.push(merged);
          points += merged;
          index += 1;
        } else {
          result.push(values[index]);
        }
      }
      while (result.length < 4) result.push(0);
      return result;
    }

    const coordinate = (line, offset, direction) => {
      if (direction === "left") return line * 4 + offset;
      if (direction === "right") return line * 4 + (3 - offset);
      if (direction === "up") return offset * 4 + line;
      return (3 - offset) * 4 + line;
    };

    function canMove() {
      if (cells.includes(0)) return true;
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const value = cells[row * 4 + column];
          if (column < 3 && value === cells[row * 4 + column + 1]) return true;
          if (row < 3 && value === cells[(row + 1) * 4 + column]) return true;
        }
      }
      return false;
    }

    function render() {
      const stage = boardElement.parentElement;
      const side = Math.max(1, Math.min(stage.clientWidth, stage.clientHeight));
      boardElement.style.width = `${side}px`;
      boardElement.style.height = `${side}px`;
      Array.from(boardElement.children).forEach((tile, index) => {
        const value = cells[index];
        tile.dataset.value = String(Math.min(value, 2048));
        tile.textContent = value || "";
      });
      score.textContent = String(points);
    }

    directionInput = (direction) => {
      if (!gameVisible || finished) return;
      const before = cells.join(",");
      const next = Array(16).fill(0);
      for (let line = 0; line < 4; line += 1) {
        const values = Array.from({ length: 4 }, (_, offset) => cells[coordinate(line, offset, direction)]);
        const moved = slide(values);
        moved.forEach((value, offset) => { next[coordinate(line, offset, direction)] = value; });
      }
      cells = next;
      if (cells.join(",") === before) return;
      addTile();
      render();
      if (cells.includes(2048)) status.textContent = "到达 2048，继续挑战更高分";
      if (!canMove()) {
        finished = true;
        status.textContent = "没有可移动方块 · 点击重开";
      }
    };

    restartGame = () => {
      cells = Array(16).fill(0);
      points = 0;
      finished = false;
      addTile();
      addTile();
      status.textContent = "合并相同数字";
      render();
    };
    observeStage(render);
    restartGame();
  }

  function setupSnake() {
    const columns = 24;
    const rows = 14;
    let snake = [];
    let food = { x: 0, y: 0 };
    let direction = { x: 1, y: 0 };
    let queuedDirection = direction;
    let points = 0;
    let timer = null;
    let finished = false;

    title.textContent = "贪吃蛇";
    help.textContent = "方向键 / WASD 改变方向";
    undoButton.hidden = true;
    directionPad.hidden = false;

    function placeFood() {
      const empty = [];
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          if (!snake.some((part) => part.x === x && part.y === y)) empty.push({ x, y });
        }
      }
      food = empty[Math.floor(Math.random() * empty.length)] || { x: -1, y: -1 };
    }

    function draw() {
      const { width, height } = fitCanvas(columns / rows);
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#0b151b";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(143, 162, 173, 0.08)";
      context.lineWidth = 1;
      for (let x = 1; x < columns; x += 1) {
        context.beginPath();
        context.moveTo(x * cellWidth, 0);
        context.lineTo(x * cellWidth, height);
        context.stroke();
      }
      for (let y = 1; y < rows; y += 1) {
        context.beginPath();
        context.moveTo(0, y * cellHeight);
        context.lineTo(width, y * cellHeight);
        context.stroke();
      }
      context.fillStyle = "#d8b476";
      context.beginPath();
      context.arc((food.x + 0.5) * cellWidth, (food.y + 0.5) * cellHeight, Math.min(cellWidth, cellHeight) * 0.29, 0, Math.PI * 2);
      context.fill();
      snake.forEach((part, index) => {
        context.fillStyle = index === 0 ? "#8ee2e4" : `hsl(${184 - Math.min(35, index)}, 48%, ${56 - Math.min(18, index)}%)`;
        context.fillRect(
          part.x * cellWidth + 1,
          part.y * cellHeight + 1,
          Math.max(1, cellWidth - 2),
          Math.max(1, cellHeight - 2)
        );
      });
      score.textContent = String(points);
    }

    function stopTimer() {
      window.clearInterval(timer);
      timer = null;
    }

    function startTimer() {
      if (!gameVisible || finished || timer) return;
      timer = window.setInterval(tick, Math.max(62, 125 - points * 2));
    }

    function tick() {
      direction = queuedDirection;
      const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
      };
      if (head.x < 0 || head.x >= columns || head.y < 0 || head.y >= rows
        || snake.some((part) => part.x === head.x && part.y === head.y)) {
        finished = true;
        stopTimer();
        status.textContent = "撞到了 · 点击重开";
        draw();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        points += 1;
        placeFood();
        stopTimer();
        startTimer();
      } else {
        snake.pop();
      }
      draw();
    }

    directionInput = (name) => {
      const next = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
      }[name];
      if (!next || next.x === -direction.x && next.y === -direction.y) return;
      queuedDirection = next;
      startTimer();
    };

    restartGame = () => {
      stopTimer();
      snake = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }];
      direction = { x: 1, y: 0 };
      queuedDirection = direction;
      points = 0;
      finished = false;
      placeFood();
      status.textContent = gameVisible ? "游戏进行中" : "悬停后继续";
      draw();
      startTimer();
    };
    visibilityChanged = () => {
      if (gameVisible) {
        status.textContent = finished ? "撞到了 · 点击重开" : "游戏进行中";
        startTimer();
      } else {
        stopTimer();
        if (!finished) status.textContent = "已暂停";
      }
    };
    observeStage(draw);
    restartGame();
  }

  const keyDirections = {
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right"
  };

  window.addEventListener("keydown", (event) => {
    const direction = keyDirections[event.key];
    if (!direction) return;
    event.preventDefault();
    directionInput(direction);
  });

  directionPad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-direction]");
    if (button) directionInput(button.dataset.direction);
  });
  restartButton.addEventListener("click", () => restartGame());
  undoButton.addEventListener("click", () => undoMove());

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== "deskframe:media-visibility") return;
    if (event.data.token !== privacyToken) return;
    gameVisible = Boolean(event.data.visible);
    visibilityChanged();
  });

  if (gameType === "2048") setup2048();
  else if (gameType === "snake") setupSnake();
  else setupGomoku();
})();
