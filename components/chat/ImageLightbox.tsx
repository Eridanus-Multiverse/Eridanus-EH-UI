import { useState, useCallback, useRef } from "react";
import { useNoiseFree } from "../decor/NoiseOverlay";
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { fonts } from "../../theme/colors";

interface Props {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex, onClose }: Props) {
  useNoiseFree();
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const prev = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  const handleWheel = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => Math.max(0.5, Math.min(5, s - e.deltaY * 0.002)));
  }, []);

  const handlePointerDown = useCallback((e: any) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  }, [translate]);

  const handlePointerMove = useCallback((e: any) => {
    if (!dragging.current) return;
    e.stopPropagation();
    setTranslate({
      x: translateStart.current.x + e.clientX - dragStart.current.x,
      y: translateStart.current.y + e.clientY - dragStart.current.y,
    });
  }, []);

  const handlePointerUp = useCallback((e: any) => {
    if (!dragging.current) return;
    e.stopPropagation();
    const dx = Math.abs(e.clientX - dragStart.current.x);
    const dy = Math.abs(e.clientY - dragStart.current.y);
    dragging.current = false;
    if (dx < 4 && dy < 4 && scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [scale]);

  const handleSave = useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = images[index];
    a.download = `image-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [images, index]);

  const { width: screenW, height: screenH } = Dimensions.get("window");

  const webImageHandlers = Platform.OS === "web" ? {
    onWheel: handleWheel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  } as any : {};

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <View
        style={[styles.imageContainer, { width: screenW, height: screenH }]}
        pointerEvents="box-none"
      >
        <View
          style={styles.imageWrapper}
          {...webImageHandlers}
        >
          <Image
            source={{ uri: images[index] }}
            style={[
              styles.image,
              {
                transform: [
                  { translateX: translate.x },
                  { translateY: translate.y },
                  { scale },
                ],
              },
            ]}
            resizeMode="contain"
          />
        </View>
      </View>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {Platform.OS === "web" && (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.7}>
          <Text style={styles.saveBtnText}>↓</Text>
        </TouchableOpacity>
      )}

      {images.length > 1 && (
        <>
          <TouchableOpacity style={[styles.navBtn, styles.navLeft]} onPress={prev} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, styles.navRight]} onPress={next} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  imageContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrapper: {
    width: "90%",
    height: "80%",
    ...(Platform.OS === "web" ? { cursor: "grab", touchAction: "none" } as any : {}),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 310,
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: fonts.pixel,
  },
  saveBtn: {
    position: "absolute",
    top: 48,
    right: 72,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 310,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: fonts.pixel,
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    width: 44,
    height: 44,
    marginTop: -22,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 310,
  },
  navLeft: {
    left: 12,
  },
  navRight: {
    right: 12,
  },
  navBtnText: {
    color: "#fff",
    fontSize: 24,
    fontFamily: fonts.pixel,
  },
  counter: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    zIndex: 310,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: fonts.pixel,
  },
});
