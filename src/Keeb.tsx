import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, CanvasProps, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  Euler,
  Group,
  Quaternion,
  Vector3,
} from "three";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

const SHOW_SYMBOLS = true;
const SYMBOL_OFFSET = 0.01;
const FONT_SIZE = 0.06;
const KEY_SIZE = 0.2;
const KEY_HEIGHT = 0.1;
const KEY_TRAVEL = 0.04;
const GRID_SPACING = 0.24;
const SPECIAL_KEY_OFFSET = 2 * GRID_SPACING;
const BOARD_DEPTH = 0.1;
const BOARD_BORDER = 0.1;
const DAMPING = 0.84;
const IMPULSE = 2.4;
const RETURN_SPEED = 2.4;
const INITIAL_ROT = new Euler(0.4, 0.2, -1.2, Euler.DEFAULT_ORDER);
const WANTED_ROT = new Euler(0.4, 0.2, -0.8, Euler.DEFAULT_ORDER);
const DELTA_ROT = new Euler(0, 0, 0, Euler.DEFAULT_ORDER);
const INITIAL_ANG_VEL = new Vector3(0, 0, 0);

const symbols = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

const ags = new Vector3(
  Math.max(...symbols.map((str) => str.length)) * GRID_SPACING,
  0,
  symbols.length * GRID_SPACING,
);

const manual_symbols: Record<string, CustomKey> = {
  " ": {
    pos: new Vector3(ags.x / 2, 0, ags.z),
    size: new Vector3(6 * KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "[ _ ]",
  },
  Backspace: {
    pos: new Vector3(ags.x + SPECIAL_KEY_OFFSET * GRID_SPACING, 0, 0),
    size: new Vector3(KEY_SIZE * 2, KEY_HEIGHT, KEY_SIZE),
    text: "backspace",
  },
  Enter: {
    pos: new Vector3(
      ags.x + SPECIAL_KEY_OFFSET * GRID_SPACING,
      0,
      GRID_SPACING * 2,
    ),
    size: new Vector3(KEY_SIZE * 2, KEY_HEIGHT, KEY_SIZE),
    text: "enter",
  },
  ArrowLeft: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 2) * GRID_SPACING, 0, ags.z),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "<",
  },
  ArrowDown: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 3) * GRID_SPACING, 0, ags.z),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "v",
  },
  ArrowRight: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 4) * GRID_SPACING, 0, ags.z),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: ">",
  },
  ArrowUp: {
    pos: new Vector3(
      ags.x + (SPECIAL_KEY_OFFSET + 3) * GRID_SPACING,
      0,
      ags.z - GRID_SPACING,
    ),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "^",
  },
  Insert: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 2) * GRID_SPACING, 0, 0),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "ins",
  },
  Home: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 3) * GRID_SPACING, 0, 0),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "home",
  },
  PageUp: {
    pos: new Vector3(ags.x + (SPECIAL_KEY_OFFSET + 4) * GRID_SPACING, 0, 0),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "pgup",
  },
  Delete: {
    pos: new Vector3(
      ags.x + (SPECIAL_KEY_OFFSET + 2) * GRID_SPACING,
      0,
      GRID_SPACING,
    ),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "del",
  },
  End: {
    pos: new Vector3(
      ags.x + (SPECIAL_KEY_OFFSET + 3) * GRID_SPACING,
      0,
      GRID_SPACING,
    ),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "end",
  },
  PageDown: {
    pos: new Vector3(
      ags.x + (SPECIAL_KEY_OFFSET + 4) * GRID_SPACING,
      0,
      GRID_SPACING,
    ),
    size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
    text: "pgdn",
  },
};

type CustomKey = {
  pos: Vector3;
  size: Vector3;
  text: string;
};

let key_spec = (() => {
  const spec: Record<string, CustomKey> = {};
  let prev_sym_length = 0;
  let off_h = 0;
  symbols.forEach((rc, ri) => {
    off_h += (GRID_SPACING * (prev_sym_length / rc.length)) / 2;
    prev_sym_length = rc.length;

    rc.split("").forEach((cc, ci) => {
      spec[cc] = {
        pos: new Vector3(ci * GRID_SPACING + off_h, 0.0, ri * GRID_SPACING),
        size: new Vector3(KEY_SIZE, KEY_HEIGHT, KEY_SIZE),
        text: cc,
      };
    });
  });
  return { ...spec, ...manual_symbols };
})();

const keeb_pos = (() => {
  const spec_pos = Object.values(key_spec).map((k) => k.pos);
  return [
    new Vector3(
      Math.min(...spec_pos.map((p) => p.x)),
      Math.min(...spec_pos.map((p) => p.y)),
      Math.min(...spec_pos.map((p) => p.z)),
    ),
    new Vector3(
      Math.max(...spec_pos.map((p) => p.x)),
      Math.max(...spec_pos.map((p) => p.y)),
      Math.max(...spec_pos.map((p) => p.z)),
    ),
  ];
})();

const keeb_offset = keeb_pos[0].clone().add(keeb_pos[1]).multiplyScalar(0.5);
const keeb_size = keeb_pos[0].clone().sub(keeb_pos[1]);

const centered_spec: Record<string, CustomKey> = {};
for (const [key, spec] of Object.entries(key_spec)) {
  centered_spec[key] = { ...spec, pos: spec.pos.clone().sub(keeb_offset) };
}
key_spec = centered_spec;

export default function KeebScene(props: CanvasProps) {
  const { className, ...rest } = props;
  return (
    <Canvas
      className={className}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
      camera={{
        position: [0, 8, 2],
        fov: 20,
      }}
      {...rest}
    >
      <directionalLight position={[4, 4, 4]} />
      <Keeb />
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.6}
          luminanceSmoothing={1.4}
          intensity={0.4}
        />
      </EffectComposer>
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}

export function Keeb() {
  const group = useRef<Group>(null!);
  const [ang_vel] = useState(() => INITIAL_ANG_VEL);
  const elapsed = useRef(0);

  useEffect(() => {
    if (group.current) {
      group.current.setRotationFromEuler(INITIAL_ROT);
    }
  }, []);

  const [pressed, setPressed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key;
      const pos = key_spec[key].pos;
      if (!pos) return;

      setPressed((s) => new Set(s).add(key));
      const force = new Vector3(0, -1, 0).multiplyScalar(IMPULSE);
      const torque = new Vector3().crossVectors(pos, force);
      ang_vel.add(torque);
    };

    const up = (e: KeyboardEvent) => {
      const key = e.key;
      if (key_spec[key]) {
        setPressed((s) => {
          const copy = new Set(s);
          copy.delete(key);
          return copy;
        });
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ang_vel]);

  useFrame((_, dt) => {
    if (!group.current) return;

    const dr = new Euler(
      ang_vel.x * dt,
      ang_vel.y * dt,
      ang_vel.z * dt,
      Euler.DEFAULT_ORDER,
    );
    group.current.rotation.x += dr.x;
    group.current.rotation.y += dr.y;
    group.current.rotation.z += dr.z;

    const target_rot = new Euler(
      WANTED_ROT.x + DELTA_ROT.x * elapsed.current,
      WANTED_ROT.y + DELTA_ROT.y * elapsed.current,
      WANTED_ROT.z + DELTA_ROT.z * elapsed.current,
      "XYZ",
    );

    elapsed.current += dt;

    group.current.quaternion.slerp(
      new Quaternion().setFromEuler(target_rot),
      RETURN_SPEED * dt,
    );
    ang_vel.multiplyScalar(Math.pow(DAMPING, dt * 60));
  });

  return (
    <group ref={group}>
      {Object.entries(key_spec).map(([k, spec]) => {
        const is_down = pressed.has(k);
        return (
          <>
            <mesh key="board" position={new Vector3(0, -0.1, 0)}>
              <boxGeometry
                args={[
                  keeb_size.x - KEY_SIZE - BOARD_BORDER,
                  BOARD_DEPTH,
                  keeb_size.z - KEY_SIZE - BOARD_BORDER,
                ]}
              />
              <meshPhysicalMaterial
                color="cyan"
                transmission={0.9}
                thickness={BOARD_DEPTH}
                roughness={0.4}
                metalness={0.0}
                clearcoat={1}
                clearcoatRoughness={0}
              />
            </mesh>
            <mesh
              key={k}
              position={[
                spec.pos.x,
                is_down ? -KEY_TRAVEL : spec.pos.y,
                spec.pos.z,
              ]}
            >
              <boxGeometry args={spec.size.toArray()} />
              {is_down ? (
                <meshPhysicalMaterial emissive="#fff" emissiveIntensity={1.2} />
              ) : (
                <meshNormalMaterial />
              )}
            </mesh>
            {SHOW_SYMBOLS && (
              <Text
                position={[
                  spec.pos.x,
                  is_down
                    ? SYMBOL_OFFSET + KEY_HEIGHT / 2 - KEY_TRAVEL
                    : SYMBOL_OFFSET + KEY_HEIGHT / 2 + spec.pos.y,
                  spec.pos.z,
                ]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={FONT_SIZE}
                color="black"
                anchorX="center"
                anchorY="middle"
              >
                {spec.text}
              </Text>
            )}
          </>
        );
      })}
    </group>
  );
}
