import cv2

rtsp = "rtsp://admin:admin123456@192.168.1.108:554/cam/realmonitor?channel=1&subtype=1"

cap = cv2.VideoCapture(rtsp)

if not cap.isOpened():
    print("❌ Cannot connect to CCTV")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ No frame received")
        break

    cv2.imshow("CCTV Live", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()