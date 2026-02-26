"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float } from "@react-three/drei";

function Gear({ position, color, speed = 0.7, scale = 1 }) {
  const groupRef = useRef(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * speed;
    }
  });

  const teeth = useMemo(() => Array.from({ length: 12 }), []);

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.75, 0.75, 0.22, 28]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.3, 20]} />
        <meshStandardMaterial color="#d2dbe3" metalness={0.55} roughness={0.35} />
      </mesh>
      {teeth.map((_, idx) => {
        const angle = (idx / teeth.length) * Math.PI * 2;
        const radius = 0.96;
        return (
          <mesh
            key={idx}
            position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
            rotation={[0, 0, angle]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.14, 0.24, 0.16]} />
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

function Conveyor() {
  const beltRef = useRef(null);

  useFrame((_, delta) => {
    if (beltRef.current) {
      beltRef.current.position.x += delta * 0.35;
      if (beltRef.current.position.x > 0.7) {
        beltRef.current.position.x = -0.7;
      }
    }
  });

  return (
    <group position={[0, -1.2, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[4.8, 0.3, 1.2]} />
        <meshStandardMaterial color="#8896a3" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={beltRef} position={[0, 0.2, 0]}>
        <boxGeometry args={[1.2, 0.08, 1.05]} />
        <meshStandardMaterial color="#1f7a8c" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[1.15, 0.24, 0]} castShadow>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="#e08e45" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[-1.2, 0.24, 0]} castShadow>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="#c0ccd7" metalness={0.3} roughness={0.45} />
      </mesh>
    </group>
  );
}

function FactoryObjects() {
  return (
    <>
      <Float speed={1.8} rotationIntensity={0.15} floatIntensity={0.3}>
        <Gear position={[-1.65, 0.9, 0]} color="#2d7b90" speed={0.8} />
      </Float>
      <Float speed={2.2} rotationIntensity={0.2} floatIntensity={0.2}>
        <Gear position={[0, 0.45, 0]} color="#7aa1b6" speed={-1.15} scale={1.2} />
      </Float>
      <Float speed={1.6} rotationIntensity={0.1} floatIntensity={0.25}>
        <Gear position={[1.65, 0.95, 0]} color="#e08e45" speed={0.95} />
      </Float>
      <Conveyor />
      <mesh position={[0, -2.3, -0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#dbe7f2" roughness={0.9} metalness={0.05} />
      </mesh>
    </>
  );
}

export function FactoryScene() {
  return (
    <div className="h-[330px] w-full overflow-hidden rounded-2xl border border-line bg-[#edf4fa] sm:h-[380px]">
      <Canvas shadows camera={{ position: [0, 1.1, 6], fov: 42 }}>
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[4, 4, 3]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <FactoryObjects />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
