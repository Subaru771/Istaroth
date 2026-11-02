//go:build windows

// Istaroth v1.0 Windows Setup. All UI is drawn with native Win32 GDI:
// no WebView, runtime dependencies, console or external fonts.
package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

//go:embed icon.ico
var setupIcon []byte

const (
	wsChild         = 0x40000000
	wsVisible       = 0x10000000
	wsTabstop       = 0x00010000
	wsCaption       = 0x00C00000
	wsSysMenu       = 0x00080000
	wsMinimize      = 0x00020000
	wsClipChildren  = 0x02000000
	wsBorder        = 0x00800000
	esAutoHscroll   = 0x0080
	bsOwnerDraw     = 0x000B
	wmCreate        = 0x0001
	wmDestroy       = 0x0002
	wmClose         = 0x0010
	wmPaint         = 0x000F
	wmEraseBk       = 0x0014
	wmCommand       = 0x0111
	wmDrawItem      = 0x002B
	wmCtlColorEdit  = 0x0133
	wmSetFont       = 0x0030
	wmSetIcon       = 0x0080
	wmAppDone       = 0x8001
	dtLeft          = 0x0000
	dtCenter        = 0x0001
	dtVCenter       = 0x0004
	dtWordBreak     = 0x0010
	dtSingleLine    = 0x0020
	dtEndEllipsis   = 0x00008000
	textTransparent = 1
	idBack          = 101
	idNext          = 102
	idCancel        = 103
	idPath          = 104
	idBrowse        = 105
	idDesktop       = 106
	idStartup       = 107
	idLaunch        = 108
	pageWelcome     = 0
	pageFolder      = 1
	pageOptions     = 2
	pageInstalling  = 3
	pageFinish      = 4
	pageFailed      = 5
	uiWidth         = 960
	uiHeight        = 632
	sidebarWidth    = 286
)

type rect struct{ Left, Top, Right, Bottom int32 }
type paintStruct struct {
	hdc     uintptr
	erase   int32
	rc      rect
	restore int32
	inc     int32
	rgb     [32]byte
}
type wndClassEx struct {
	cbSize, style                      uint32
	wndProc                            uintptr
	clsExtra, wndExtra                 int32
	instance, icon, cursor, background uintptr
	menuName, className                *uint16
	iconSm                             uintptr
}
type msg struct {
	hwnd           uintptr
	message        uint32
	wparam, lparam uintptr
	time           uint32
	x, y           int32
	private        uint32
}
type drawItem struct {
	ctlType, ctlID                uint32
	itemID, itemAction, itemState uint32
	hwndItem, hdc                 uintptr
	rcItem                        rect
	itemData                      uintptr
}
type gradientVertex struct {
    x,y int32
    red,green,blue,alpha uint16
}
type gradientEdge struct {first,second uint32}
type browseInfo struct {
	owner, root        uintptr
	displayName, title *uint16
	flags              uint32
	callback, lparam   uintptr
	image              int32
	pad                uint32
}

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	gdi32            = syscall.NewLazyDLL("gdi32.dll")
	shell32          = syscall.NewLazyDLL("shell32.dll")
	ole32            = syscall.NewLazyDLL("ole32.dll")
	createWindow     = user32.NewProc("CreateWindowExW")
	registerClass    = user32.NewProc("RegisterClassExW")
	defProc          = user32.NewProc("DefWindowProcW")
	getMessage       = user32.NewProc("GetMessageW")
	translateMessage = user32.NewProc("TranslateMessage")
	dispatchMessage  = user32.NewProc("DispatchMessageW")
	sendMessage      = user32.NewProc("SendMessageW")
	postMessage      = user32.NewProc("PostMessageW")
	destroyWindow    = user32.NewProc("DestroyWindow")
	showWindow       = user32.NewProc("ShowWindow")
	updateWindow     = user32.NewProc("UpdateWindow")
	setWindowText    = user32.NewProc("SetWindowTextW")
	getWindowText    = user32.NewProc("GetWindowTextW")
	enableWindow     = user32.NewProc("EnableWindow")
	postQuitMessage  = user32.NewProc("PostQuitMessage")
	invalidateRect   = user32.NewProc("InvalidateRect")
	beginPaint       = user32.NewProc("BeginPaint")
	endPaint         = user32.NewProc("EndPaint")
	drawTextProc     = user32.NewProc("DrawTextW")
	drawIconProc     = user32.NewProc("DrawIconEx")
	fillRectProc     = user32.NewProc("FillRect")
	getClientRect    = user32.NewProc("GetClientRect")
	getModuleHandle  = kernel32.NewProc("GetModuleHandleW")
	loadImage        = user32.NewProc("LoadImageW")
	createFont       = gdi32.NewProc("CreateFontW")
	deleteObject     = gdi32.NewProc("DeleteObject")
	gradientFillProc = syscall.NewLazyDLL("msimg32.dll").NewProc("GradientFill")
	createMemDC     = gdi32.NewProc("CreateCompatibleDC")
	createBmp       = gdi32.NewProc("CreateCompatibleBitmap")
	bitBlt          = gdi32.NewProc("BitBlt")
	deleteDC        = gdi32.NewProc("DeleteDC")
	createBrush      = gdi32.NewProc("CreateSolidBrush")
	createPen        = gdi32.NewProc("CreatePen")
	selectObject     = gdi32.NewProc("SelectObject")
	getStockObject   = gdi32.NewProc("GetStockObject")
	roundRect        = gdi32.NewProc("RoundRect")
	ellipse          = gdi32.NewProc("Ellipse")
	setTextColor     = gdi32.NewProc("SetTextColor")
	setBkMode        = gdi32.NewProc("SetBkMode")
	moveTo           = gdi32.NewProc("MoveToEx")
	lineTo           = gdi32.NewProc("LineTo")
	browseFolderProc = shell32.NewProc("SHBrowseForFolderW")
	folderPathProc   = shell32.NewProc("SHGetPathFromIDListW")
	coTaskMemFree    = ole32.NewProc("CoTaskMemFree")
	state            wizardState
)

type wizardState struct {
	hwnd                                                             uintptr
	current                                                          int
	widgets                                                          []uintptr
	control                                                          map[int]uintptr
	instance                                                         uintptr
	dest                                                             string
	desktop, startup, launch                                         bool
	resultErr                                                        error
	running                                                          bool
	status                                                           string
	progress                                                         int
	mu                                                               sync.Mutex
	font, captionFont, smallFont, headingFont, brandFont, buttonFont uintptr
	icon                                                             uintptr
	editBrush                                                        uintptr
}

func u16(s string) *uint16         { return syscall.StringToUTF16Ptr(s) }
func color(r, g, b uint32) uintptr { return uintptr(r | (g << 8) | (b << 16)) }

var (
    dark     = color(15, 19, 40)
    darkCard = color(38, 39, 77)
    navy     = color(31, 33, 65)
    gold     = color(211, 171, 111)
    warmGold = color(244, 210, 151)
    muted    = color(184, 181, 208)
    ink      = color(251, 242, 226)
    paper    = color(26, 28, 58)
    white    = color(46, 45, 84)
    outline  = color(87, 78, 126)
    subdued  = color(157, 153, 186)
    green    = color(114, 213, 173)
    accentPurple = color(110, 84, 156)
    plum = color(54, 42, 88)
    darkEdit = color(26, 28, 55)
)

func txtControl(h uintptr) string {
	b := make([]uint16, 32768)
	n, _, _ := getWindowText.Call(h, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)))
	return syscall.UTF16ToString(b[:int(n)])
}
func send(h uintptr, msg, wp, lp uintptr) uintptr {
	v, _, _ := sendMessage.Call(h, msg, wp, lp)
	return v
}
func createChild(cls, text string, style uintptr, x, y, w, h, id int) uintptr {
	handle, _, _ := createWindow.Call(0, uintptr(unsafe.Pointer(u16(cls))), uintptr(unsafe.Pointer(u16(text))), style|wsChild|wsVisible, uintptr(x), uintptr(y), uintptr(w), uintptr(h), state.hwnd, uintptr(id), state.instance, 0)
	if handle != 0 {
		send(handle, wmSetFont, state.font, 1)
		state.widgets = append(state.widgets, handle)
		if id > 0 {
			state.control[id] = handle
		}
	}
	return handle
}
func addButton(id int, text string, x, y, w, h int) {
	createChild("BUTTON", text, wsTabstop|bsOwnerDraw, x, y, w, h, id)
}
func addToggle(id int, x, y, w, h int) {
	createChild("BUTTON", "", wsTabstop|bsOwnerDraw, x, y, w, h, id)
}
func destroyControls() {
	for _, w := range state.widgets {
		destroyWindow.Call(w)
	}
	state.widgets = nil
	state.control = map[int]uintptr{}
}
func refreshControls() {
	destroyControls()
	switch state.current {
	case pageFolder:
		createChild("EDIT", state.dest, wsTabstop|esAutoHscroll, 360, 256, 368, 27, idPath)
		addButton(idBrowse, "Browse", 747, 248, 129, 40)
	case pageOptions:
		addToggle(idDesktop, 351, 252, 529, 74)
		addToggle(idStartup, 351, 339, 529, 74)
	case pageFinish:
		addToggle(idLaunch, 351, 391, 529, 62)
	}
	if state.current != pageInstalling {
		switch state.current {
		case pageWelcome:
			addButton(idNext, "Get started", 742, 540, 152, 46)
		case pageFolder:
			addButton(idBack, "Back", 609, 540, 118, 46)
			addButton(idNext, "Continue", 742, 540, 152, 46)
		case pageOptions:
			addButton(idBack, "Back", 609, 540, 118, 46)
			addButton(idNext, "Install", 742, 540, 152, 46)
		case pageFinish:
			addButton(idNext, "Finish", 742, 540, 152, 46)
		case pageFailed:
			addButton(idBack, "Back", 609, 540, 118, 46)
			addButton(idNext, "Retry", 742, 540, 152, 46)
		}
		if state.current != pageFinish {
			addButton(idCancel, "Cancel", 352, 540, 115, 46)
		}
	}
	invalidateRect.Call(state.hwnd, 0, 1)
}
func gradient(hdc uintptr,x,y,w,h int,c1,c2 uintptr, vertical bool) {
  mk:=func(px,py int,c uintptr) gradientVertex {
    return gradientVertex{int32(px),int32(py),uint16((c&255)<<8),uint16(((c>>8)&255)<<8),uint16(((c>>16)&255)<<8),0}
  }
  vs:=[2]gradientVertex{mk(x,y,c1),mk(x+w,y+h,c2)}
  edge:=[1]gradientEdge{{0,1}}
  mode:=uintptr(0)
  if vertical {mode=1}
  gradientFillProc.Call(hdc,uintptr(unsafe.Pointer(&vs[0])),2,uintptr(unsafe.Pointer(&edge[0])),1,mode)
}
func roundedOutline(hdc uintptr,x,y,w,h,radius,thickness int,c uintptr){
  pen,_,_:=createPen.Call(0,uintptr(thickness),c)
  oldPen,_,_:=selectObject.Call(hdc,pen)
  hollow,_,_:=getStockObject.Call(5)
  oldBrush,_,_:=selectObject.Call(hdc,hollow)
  roundRect.Call(hdc,uintptr(x),uintptr(y),uintptr(x+w),uintptr(y+h),uintptr(radius),uintptr(radius))
  selectObject.Call(hdc,oldBrush)
  selectObject.Call(hdc,oldPen)
  deleteObject.Call(pen)
}
func winRect(x, y, w, h int) rect { return rect{int32(x), int32(y), int32(x + w), int32(y + h)} }
func fill(hdc uintptr, x, y, w, h int, c uintptr) {
	r := winRect(x, y, w, h)
	b, _, _ := createBrush.Call(c)
	fillRectProc.Call(hdc, uintptr(unsafe.Pointer(&r)), b)
	deleteObject.Call(b)
}
func rounded(hdc uintptr, x, y, w, h, radius int, c uintptr) {
	br, _, _ := createBrush.Call(c)
	old, _, _ := selectObject.Call(hdc, br)
	p, _, _ := getStockObject.Call(8)
	oldPen, _, _ := selectObject.Call(hdc, p)
	roundRect.Call(hdc, uintptr(x), uintptr(y), uintptr(x+w), uintptr(y+h), uintptr(radius), uintptr(radius))
	selectObject.Call(hdc, oldPen)
	selectObject.Call(hdc, old)
	deleteObject.Call(br)
}
func ring(hdc uintptr, x, y, w, h int, stroke uintptr, thickness int) {
	pen, _, _ := createPen.Call(0, uintptr(thickness), stroke)
	oldPen, _, _ := selectObject.Call(hdc, pen)
	hollow, _, _ := getStockObject.Call(5)
	oldBrush, _, _ := selectObject.Call(hdc, hollow)
	ellipse.Call(hdc, uintptr(x), uintptr(y), uintptr(x+w), uintptr(y+h))
	selectObject.Call(hdc, oldBrush)
	selectObject.Call(hdc, oldPen)
	deleteObject.Call(pen)
}
func circle(hdc uintptr, x, y, diam int, c uintptr) {
	br, _, _ := createBrush.Call(c)
	old, _, _ := selectObject.Call(hdc, br)
	nullPen, _, _ := getStockObject.Call(8)
	oldPen, _, _ := selectObject.Call(hdc, nullPen)
	ellipse.Call(hdc, uintptr(x), uintptr(y), uintptr(x+diam), uintptr(y+diam))
	selectObject.Call(hdc, oldPen)
	selectObject.Call(hdc, old)
	deleteObject.Call(br)
}
func line(hdc uintptr, x1, y1, x2, y2 int, col uintptr, w int) {
	p, _, _ := createPen.Call(0, uintptr(w), col)
	old, _, _ := selectObject.Call(hdc, p)
	moveTo.Call(hdc, uintptr(x1), uintptr(y1), 0)
	lineTo.Call(hdc, uintptr(x2), uintptr(y2))
	selectObject.Call(hdc, old)
	deleteObject.Call(p)
}
func textAt(hdc uintptr, value string, x, y, w, h int, font, col uintptr, flags uintptr) {
	if value == "" {
		return
	}
	old, _, _ := selectObject.Call(hdc, font)
	setTextColor.Call(hdc, col)
	setBkMode.Call(hdc, textTransparent)
	rc := winRect(x, y, w, h)
	drawTextProc.Call(hdc, uintptr(unsafe.Pointer(u16(value))), uintptr(^uint32(0)), uintptr(unsafe.Pointer(&rc)), flags)
	selectObject.Call(hdc, old)
}
func smallCaps(hdc uintptr, value string, x, y, w int, col uintptr) {
	textAt(hdc, value, x, y, w, 24, state.smallFont, col, dtSingleLine|dtLeft)
}
func brand(hdc uintptr) {
    // Restrained midnight-to-indigo sidebar, with subtle celestial rings (no polygon art).
    gradient(hdc,0,0,sidebarWidth,uiHeight,color(12,19,42),color(41,32,76),true)
    ring(hdc,-158,380,375,375,color(48,55,96),1)
    ring(hdc,-105,430,272,272,color(60,56,101),1)
    line(hdc,20,0,20,uiHeight,color(55,52,92),1)
    if state.icon!=0 {
       drawIconProc.Call(hdc,42,34,state.icon,61,61,0,0,3)
    } else {
       ring(hdc,43,37,54,54,gold,2)
       textAt(hdc,"⌛",48,42,45,44,state.brandFont,warmGold,dtCenter|dtVCenter|dtSingleLine)
    }
    textAt(hdc,"ISTAROTH",112,37,166,38,state.brandFont,color(246,223,185),dtSingleLine|dtLeft)
    smallCaps(hdc,"YOUR COMPANION",114,72,166,color(218,201,172))
    smallCaps(hdc,"THROUGHOUT TIME!",114,88,166,color(218,201,172))
    line(hdc,36,137,251,137,color(87,75,116),1)
    smallCaps(hdc,"YOUR JOURNEY",38,161,190,warmGold)
    steps := []string{"Welcome", "Destination", "Preferences", "Installing", "Complete"}
    active := state.current
    if active == pageFailed { active=3 }
    for i,step:=range steps {
       y:=204+i*62
       if i==active {
           rounded(hdc,25,y-9,235,53,14,color(56,48,93))
           roundedOutline(hdc,25,y-9,235,53,14,1,color(120,94,153))
           fill(hdc,25,y+3,3,27,gold)
       }
       cc:=color(58,59,99)
       tc:=color(161,162,187)
       if i==active {cc=color(185,146,103);tc=color(250,235,212)}
       if i<active {cc=color(66,109,99);tc=color(200,220,206)}
       circle(hdc,40,y,29,cc)
       textAt(hdc,fmt.Sprintf("%02d",i+1),41,y,27,28,state.smallFont,color(250,246,235),dtSingleLine|dtCenter|dtVCenter)
       textAt(hdc,step,84,y-1,160,32,state.captionFont,tc,dtSingleLine|dtVCenter)
       if i<len(steps)-1 {line(hdc,55,y+31,55,y+49,color(84,76,119),1)}
    }
    line(hdc,37,538,250,538,color(94,77,120),1)
    smallCaps(hdc,"AN UNOFFICIAL",38,551,225,color(165,158,186))
    smallCaps(hdc,"GENSHIN COMPANION",38,570,225,color(165,158,186))
    circle(hdc,239,52,3,gold); circle(hdc,256,115,2,color(198,164,130))
}

func heading(hdc uintptr,title,description string) {
    smallCaps(hdc,"ISTAROTH  /  SETUP  /  v"+version,353,58,540,warmGold)
    textAt(hdc,title,352,113,547,59,state.headingFont,ink,dtSingleLine|dtEndEllipsis)
    textAt(hdc,description,354,181,522,60,state.font,muted,dtWordBreak)
}

func feature(hdc uintptr,x,y int,title,detail string) {
    circle(hdc,x,y+5,27,color(94,75,111))
    ring(hdc,x,y+5,27,27,gold,1)
    textAt(hdc,"✓",x+1,y+4,24,26,state.captionFont,warmGold,dtCenter|dtVCenter|dtSingleLine)
    textAt(hdc,title,x+36,y,220,28,state.captionFont,ink,dtSingleLine)
    textAt(hdc,detail,x+36,y+29,215,23,state.smallFont,muted,dtSingleLine)
}

func checkboxPaint(hdc uintptr,r rect,checked bool,title,sub string) {
    x:=int(r.Left);y:=int(r.Top);w:=int(r.Right-r.Left);h:=int(r.Bottom-r.Top)
    rounded(hdc,x,y,w,h,17,color(43,44,82))
    roundedOutline(hdc,x,y,w,h,17,1,color(90,82,128))
    rounded(hdc,x+17,y+(h-26)/2,26,26,8,color(67,60,100))
    roundedOutline(hdc,x+17,y+(h-26)/2,26,26,8,1,gold)
    if checked {
      rounded(hdc,x+17,y+(h-26)/2,26,26,8,color(188,147,99))
      textAt(hdc,"✓",x+17,y+(h-26)/2,26,26,state.captionFont,color(23,20,43),dtCenter|dtVCenter|dtSingleLine)
    }
    textAt(hdc,title,x+60,y+11,w-80,27,state.captionFont,ink,dtSingleLine)
    if sub!="" {textAt(hdc,sub,x+60,y+40,w-80,23,state.smallFont,muted,dtSingleLine)}
}

func content(hdc uintptr) {
    // Subtle plum gradient, warm headings and softly separated surfaces.
    gradient(hdc,sidebarWidth,0,uiWidth-sidebarWidth,uiHeight,color(27,30,63),color(49,36,77),true)
    line(hdc,sidebarWidth,0,sidebarWidth,uiHeight,color(97,76,123),1)
    line(hdc,353,96,897,96,color(95,82,129),1)
    line(hdc,353,515,897,515,color(95,82,129),1)
    circle(hdc,887,58,2,warmGold)
    circle(hdc,866,80,2,color(144,137,196))
    switch state.current {
    case pageWelcome:
        heading(hdc,"Your Companion Throughout Time!","Welcome to Istaroth, your celestial companion for resin, daily notes and the moments that matter in Teyvat.")
        rounded(hdc,351,251,543,211,18,color(43,42,80))
        roundedOutline(hdc,351,251,543,211,18,1,color(106,86,142))
        smallCaps(hdc,"AN ADVENTURE COMPANION",377,271,460,warmGold)
        feature(hdc,376,316,"HoYoLAB sync","Resin and daily status")
        feature(hdc,638,316,"Mini resin widget","Floating and borderless")
        feature(hdc,376,391,"Smart reminders","Notifications and history")
        feature(hdc,638,391,"Personal themes","Wallpapers and regions")
        textAt(hdc,"No manual resin editing. No game launcher.",354,479,534,23,state.smallFont,subdued,dtSingleLine)
    case pageFolder:
        heading(hdc,"Choose your destination.","Select where Istaroth will be installed. Your HoYoLAB session, wallpapers and personal settings are stored separately.")
        smallCaps(hdc,"INSTALLATION FOLDER",353,222,400,warmGold)
        rounded(hdc,351,248,386,40,9,color(87,77,123))
        rounded(hdc,352,249,384,38,8,darkEdit)
        rounded(hdc,351,325,543,121,17,color(43,42,80))
        roundedOutline(hdc,351,325,543,121,17,1,color(104,86,137))
        smallCaps(hdc,"A NOTE FROM THE TIMEKEEPER",373,347,483,warmGold)
        textAt(hdc,"First installation needs internet to download the verified Electron runtime (about 158 MB). Later upgrades can reuse it.",373,379,494,52,state.font,ink,dtWordBreak)
        textAt(hdc,"Your existing account data and saved themes will remain.",354,473,536,25,state.smallFont,muted,dtSingleLine)
    case pageOptions:
        heading(hdc,"Make yourself at home.","Choose how you'd like to start your journey. You can change Windows startup later from Istaroth settings.")
        smallCaps(hdc,"INSTALLATION PREFERENCES",354,215,492,warmGold)
        rounded(hdc,351,433,529,57,12,color(45,43,77))
        roundedOutline(hdc,351,433,529,57,12,1,color(99,84,131))
        textAt(hdc,"Windows startup launches Istaroth only — never the game.",370,448,490,30,state.smallFont,ink,dtWordBreak)
    case pageInstalling:
        heading(hdc,"A moment between worlds.","Istaroth is being prepared. The setup will notify you once everything is ready.")
        rounded(hdc,351,253,543,211,17,color(43,42,80))
        roundedOutline(hdc,351,253,543,211,17,1,color(104,86,137))
        state.mu.Lock();p:=state.progress;s:=state.status;state.mu.Unlock()
        if p<0{p=0};if p>100{p=100}
        smallCaps(hdc,"INSTALLATION PROGRESS",378,279,350,warmGold)
        textAt(hdc,fmt.Sprintf("%d%%",p),795,275,74,39,state.headingFont,ink,dtSingleLine|dtCenter)
        rounded(hdc,377,332,491,13,12,color(75,65,109))
        if p>0 {rounded(hdc,377,332,491*p/100,13,12,color(226,190,133))}
        textAt(hdc,s,377,365,483,65,state.font,ink,dtWordBreak)
        textAt(hdc,"Please keep this window open until setup is complete.",354,481,529,24,state.smallFont,muted,dtSingleLine)
    case pageFinish:
        heading(hdc,"The journey continues.","Istaroth is installed and ready to accompany you throughout time.")
        rounded(hdc,351,253,543,121,17,color(42,60,79))
        roundedOutline(hdc,351,253,543,121,17,1,color(85,143,122))
        circle(hdc,374,278,52,color(70,117,103))
        textAt(hdc,"✓",376,277,48,51,state.headingFont,color(226,246,229),dtCenter|dtVCenter|dtSingleLine)
        textAt(hdc,"Installation complete",439,277,418,34,state.captionFont,ink,dtSingleLine)
        textAt(hdc,"Your saved themes, settings and HoYoLAB session are preserved.",440,317,412,44,state.smallFont,muted,dtWordBreak)
    case pageFailed:
        heading(hdc,"The path was interrupted.","Your personal data has not been removed. You can retry after resolving the installation issue below.")
        rounded(hdc,351,251,543,210,17,color(58,39,66))
        roundedOutline(hdc,351,251,543,210,17,1,color(157,95,105))
        smallCaps(hdc,"INSTALLATION DETAILS",377,277,430,color(246,182,169))
        reason:="Unknown installation error"
        state.mu.Lock();if state.resultErr!=nil{reason=state.resultErr.Error()};state.mu.Unlock()
        textAt(hdc,reason,377,320,480,123,state.font,ink,dtWordBreak|dtEndEllipsis)
    }
    smallCaps(hdc,"WINDOWS 10 / 11     •     64-BIT     •     LOCAL-FIRST DATA",354,597,548,subdued)
}

func drawOwnerButton(di *drawItem) {
    hdc:=di.hdc;r:=di.rcItem
    x:=int(r.Left);y:=int(r.Top);w:=int(r.Right-r.Left);h:=int(r.Bottom-r.Top)
    switch int(di.ctlID) {
    case idDesktop:
        checkboxPaint(hdc,r,state.desktop,"Create desktop shortcut","Open Istaroth from your desktop")
    case idStartup:
        checkboxPaint(hdc,r,state.startup,"Start Istaroth with Windows","Repair registration automatically at sign-in")
    case idLaunch:
        checkboxPaint(hdc,r,state.launch,"Open Istaroth now","Begin using your desktop companion")
    default:
        primary:=int(di.ctlID)==idNext
        bg:=color(52,49,87)
        txt:=ink
        edge:=color(110,92,144)
        if primary {bg=color(204,168,115);txt=color(28,26,51);edge=color(243,212,158)}
        if int(di.ctlID)==idCancel {bg=color(37,37,71);txt=muted;edge=color(87,80,115)}
        if int(di.ctlID)==idBrowse {bg=color(66,54,96);txt=color(248,234,207);edge=color(135,108,159)}
        if di.itemState&0x0001!=0 {if primary {bg=color(175,136,95)} else {bg=color(64,60,103)}}
        rounded(hdc,x,y,w,h,14,bg)
        roundedOutline(hdc,x,y,w,h,14,1,edge)
        label:=txtControl(di.hwndItem)
        textAt(hdc,label,x+5,y+1,w-10,h-2,state.buttonFont,txt,dtCenter|dtVCenter|dtSingleLine)
        if di.itemState&0x0010!=0 {
           roundedOutline(hdc,x+3,y+3,w-6,h-6,12,1,color(250,231,194))
        }
    }
}

func repaint() { invalidateRect.Call(state.hwnd, 0, 0) }
func guiWndProc(hwnd uintptr, message uint32, wparam, lparam uintptr) uintptr {
	switch message {
	case wmCreate:
		state.hwnd = hwnd
		refreshControls()
		return 0
	case wmEraseBk:
		return 1
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := beginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
        var client rect
        getClientRect.Call(hwnd,uintptr(unsafe.Pointer(&client)))
        mem,_,_:=createMemDC.Call(hdc)
        bmp,_,_:=createBmp.Call(hdc,uintptr(client.Right),uintptr(client.Bottom))
        if mem!=0 && bmp!=0 {
          old,_,_:=selectObject.Call(mem,bmp)
          brand(mem)
          content(mem)
          bitBlt.Call(hdc,0,0,uintptr(client.Right),uintptr(client.Bottom),mem,0,0,0x00CC0020)
          selectObject.Call(mem,old)
        } else {
          brand(hdc)
          content(hdc)
        }
        if bmp!=0 {deleteObject.Call(bmp)}
        if mem!=0 {deleteDC.Call(mem)}
		endPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0
	case wmDrawItem:
		if lparam != 0 {
			di := (*drawItem)(unsafe.Pointer(lparam))
			drawOwnerButton(di)
			return 1
		}
	case wmCtlColorEdit:
		setTextColor.Call(wparam, ink)
		setBkMode.Call(wparam, textTransparent)
		return state.editBrush
	case wmCommand:
		id := int(wparam & 0xffff)
		if id == idDesktop {
			state.desktop = !state.desktop
			repaint()
			invalidateRect.Call(state.control[id], 0, 1)
			return 0
		}
		if id == idStartup {
			state.startup = !state.startup
			repaint()
			invalidateRect.Call(state.control[id], 0, 1)
			return 0
		}
		if id == idLaunch {
			state.launch = !state.launch
			repaint()
			invalidateRect.Call(state.control[id], 0, 1)
			return 0
		}
		if id == idNext || id == idBack || id == idCancel || id == idBrowse {
			command(id)
			return 0
		}
	case wmAppDone:
		if wparam == 1 {
			state.mu.Lock()
			err := state.resultErr
			state.mu.Unlock()
			state.running = false
			if err != nil {
				state.current = pageFailed
			} else {
				state.current = pageFinish
			}
			refreshControls()
		} else {
			repaint()
		}
		return 0
	case wmClose:
		if state.running {
			return 0
		}
		destroyWindow.Call(hwnd)
		return 0
	case wmDestroy:
		postQuitMessage.Call(0)
		return 0
	}
	r, _, _ := defProc.Call(hwnd, uintptr(message), wparam, lparam)
	return r
}
func validDestination(dest string) error {
	if !filepath.IsAbs(dest) {
		return errors.New("Choose a full Windows installation folder.")
	}
	clean := filepath.Clean(dest)
	if strings.ContainsAny(clean, "*?\"<>|") {
		return errors.New("The destination contains unsupported characters.")
	}
	if len(clean) < 6 || filepath.Dir(clean) == clean {
		return errors.New("Choose a dedicated folder, not the root of a drive.")
	}
	win := strings.ToLower(os.Getenv("WINDIR"))
	if win != "" && strings.HasPrefix(strings.ToLower(clean), win) {
		return errors.New("Choose a folder outside the Windows system directory.")
	}
	if strings.EqualFold(clean, os.Getenv("USERPROFILE")) || strings.EqualFold(clean, os.Getenv("LOCALAPPDATA")) {
		return errors.New("Select an Istaroth subfolder.")
	}
	return nil
}
func browseFolder(owner uintptr) string {
	display := make([]uint16, 260)
	bi := browseInfo{owner: owner, displayName: &display[0], title: u16("Choose a folder for Istaroth"), flags: 0x0001 | 0x0040}
	pidl, _, _ := browseFolderProc.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return ""
	}
	defer coTaskMemFree.Call(pidl)
	buf := make([]uint16, 32768)
	ok, _, _ := folderPathProc.Call(pidl, uintptr(unsafe.Pointer(&buf[0])))
	if ok == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}
func saveForm() {
	if h := state.control[idPath]; h != 0 {
		state.dest = strings.TrimSpace(txtControl(h))
	}
}
func beginInstall() {
	state.running = true
	state.current = pageInstalling
	state.mu.Lock()
	state.progress = 0
	state.status = "Preparing installation..."
	state.mu.Unlock()
	refreshControls()
	go func() {
		status := func(p int, s string) {
			state.mu.Lock()
			state.progress = p
			state.status = s
			state.mu.Unlock()
			postMessage.Call(state.hwnd, wmAppDone, 0, 0)
		}
		finish := func(err error) {
			state.mu.Lock()
			state.resultErr = err
			state.mu.Unlock()
			postMessage.Call(state.hwnd, wmAppDone, 1, 0)
		}
		dest := state.dest
		status(4, "Checking installation files...")
		if err := validDestination(dest); err != nil {
			finish(err)
			return
		}
		status(10, "Preparing the official desktop runtime...")
		if err := ensureRuntimeWithProgress(dest, func(downloaded, total int64) {
			if total > 0 {
				status(10+int(51*downloaded/total), fmt.Sprintf("Downloading runtime: %d of %d MB", downloaded/(1024*1024), total/(1024*1024)))
			} else {
				status(12, fmt.Sprintf("Downloading runtime: %d MB", downloaded/(1024*1024)))
			}
		}); err != nil {
			finish(err)
			return
		}
		status(67, "Installing the Istaroth companion...")
		if err := setupApp(dest); err != nil {
			finish(err)
			return
		}
		status(77, "Preparing the Istaroth desktop app...")
        if err := brandRuntime(dest); err != nil { finish(err); return }
        status(81, "Configuring Windows startup...")
		if err := setStartup(state.startup, dest); err != nil {
			finish(err)
			return
		}
		status(88, "Creating your shortcuts...")
		if err := installShortcuts(dest, state.desktop); err != nil {
			finish(err)
			return
		}
		status(93, "Registering the uninstaller...")
		if err := installUninstaller(dest); err != nil {
			finish(err)
			return
		}
		if err := uninstallRegistry(dest); err != nil {
			finish(err)
			return
		}
        removeLegacyBranding()
		status(100, "Installation complete.")
		finish(nil)
	}()
}
func launchInstalled() {
	target := filepath.Join(state.dest, "Istaroth.exe")
	cmd := exec.Command(target)
	cmd.Dir = state.dest
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		errBox(fmt.Errorf("Istaroth was installed but couldn't launch: %w", err))
	}
}
func command(id int) {
	switch id {
	case idBrowse:
		if p := browseFolder(state.hwnd); p != "" {
			if !strings.EqualFold(filepath.Base(p), "Istaroth") {
				p = filepath.Join(p, "Istaroth")
			}
			state.dest = p
			setWindowText.Call(state.control[idPath], uintptr(unsafe.Pointer(u16(p))))
		}
	case idCancel:
		if !state.running {
			destroyWindow.Call(state.hwnd)
		}
	case idBack:
		saveForm()
		if state.current == pageFailed {
			state.current = pageOptions
		} else if state.current > 0 {
			state.current--
		}
		refreshControls()
	case idNext:
		saveForm()
		switch state.current {
		case pageWelcome:
			state.current = pageFolder
			refreshControls()
		case pageFolder:
			if err := validDestination(state.dest); err != nil {
				errBox(err)
				return
			}
			state.current = pageOptions
			refreshControls()
		case pageOptions, pageFailed:
			beginInstall()
		case pageFinish:
			if state.launch {
				launchInstalled()
			}
			destroyWindow.Call(state.hwnd)
		}
	}
}
func font(face string, px, weight int) uintptr {
	h, _, _ := createFont.Call(uintptr(int32(-px)), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(u16(face))))
	return h
}
func runWizard() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	coin := ole32.NewProc("CoInitializeEx")
	res, _, _ := coin.Call(0, 2)
	if res == 0 || res == 1 {
		defer ole32.NewProc("CoUninitialize").Call()
	}
	dest := existingInstall()
	if dest == "" {
		errBox(errors.New("LOCALAPPDATA is unavailable. Cannot determine an installation folder."))
		return
	}
	state = wizardState{current: pageWelcome, dest: dest, desktop: true, startup: true, launch: true, control: map[int]uintptr{}}
	if b, err := os.ReadFile(filepath.Join(userData(), "startup-preference.json")); err == nil {
		var cfg struct {
			Enabled *bool `json:"enabled"`
		}
		if json.Unmarshal(b, &cfg) == nil && cfg.Enabled != nil {
			state.startup = *cfg.Enabled
		}
	}
	state.font = font("Segoe UI", 17, 400)
	state.captionFont = font("Segoe UI Semibold", 18, 600)
	state.smallFont = font("Segoe UI", 14, 400)
	state.headingFont = font("Georgia", 35, 400)
	state.brandFont = font("Georgia", 27, 500)
	state.buttonFont = font("Segoe UI Semibold", 16, 600)
	for _, f := range []uintptr{state.font, state.captionFont, state.smallFont, state.headingFont, state.brandFont, state.buttonFont} {
		defer deleteObject.Call(f)
	}
	state.editBrush, _, _ = createBrush.Call(darkEdit)
	defer deleteObject.Call(state.editBrush)
	inst, _, _ := getModuleHandle.Call(0)
	state.instance = inst
	// Let Win32 scale this consistent fixed layout on high DPI monitors.
	className := u16("IstarothPremiumSetup247")
	cl := wndClassEx{cbSize: uint32(unsafe.Sizeof(wndClassEx{})), wndProc: syscall.NewCallback(guiWndProc), instance: inst, background: 0, className: className}
	// Use the packaged application icon for the setup title bar.
	tempIcon := filepath.Join(os.TempDir(), "istaroth-setup-icon.ico")
	if os.WriteFile(tempIcon, setupIcon, 0600) == nil {
		h, _, _ := loadImage.Call(0, uintptr(unsafe.Pointer(u16(tempIcon))), 1, 64, 64, 0x0010)
		cl.icon = h
		cl.iconSm = h
		state.icon = h
		defer os.Remove(tempIcon)
	}
	if r, _, e := registerClass.Call(uintptr(unsafe.Pointer(&cl))); r == 0 {
		errBox(fmt.Errorf("Setup window registration failed: %v", e))
		return
	}
	h, _, e := createWindow.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(u16("Istaroth — Premium Setup"))), wsCaption|wsSysMenu|wsMinimize|wsClipChildren|wsVisible,
		0x80000000, 0x80000000, uiWidth+16, uiHeight+40, 0, 0, inst, 0)
	if h == 0 {
		errBox(fmt.Errorf("Could not open setup: %v", e))
		return
	}
	if state.icon != 0 {
		send(h, wmSetIcon, 1, state.icon)
	}
	showWindow.Call(h, 5)
	updateWindow.Call(h)
	var m msg
	for {
		r, _, _ := getMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		translateMessage.Call(uintptr(unsafe.Pointer(&m)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}
func main() {
	for _, arg := range os.Args[1:] {
		if strings.EqualFold(arg, "/uninstall") {
			dest := filepath.Dir(os.Args[0])
			if message(appName+" · Uninstall", "Remove Istaroth?\n\nLocal preferences, wallpapers and HoYoLAB login will be kept.", 0x24) == yes {
				removeApp(dest)
			}
			return
		}
	}
	runWizard()
}
