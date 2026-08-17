// Input frames: everything the simulation knows about player intent for one tick.
// Devices (keyboard/mouse/gamepad/touch) are sampled into this shape by the shell;
// the core never touches browser APIs. Frames are small and serializable so runs
// can be recorded and replayed.

export type InputFrame = {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimX: number; // -1..1 (direction; 0,0 = not aiming → auto-aim)
  aimY: number;
  fire: boolean; // held (mouse aim implies fire only when held)
  dash: boolean; // edge-triggered by shell (true only on the press tick)
  interact: boolean;
  ability: boolean;
};

export function neutralInput(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fire: false,
    dash: false,
    interact: false,
    ability: false,
  };
}

export function cloneInput(f: InputFrame): InputFrame {
  return { ...f };
}
