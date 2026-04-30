import { forwardRef } from 'react';
import * as Lucide from 'lucide-react';
import * as Iconoir from 'iconoir-react';
import { useAtomValue } from "jotai";
import { userSettingsAtom } from "@/atoms/appAtoms";

export type LucideIcon = Lucide.LucideIcon;

export const withIconFactory = (LucideComponent: any, IconoirComponent: any) => {
  return forwardRef<any, any>((props, ref) => {
    const settings = useAtomValue(userSettingsAtom);
    if (settings?.iconLibrary === 'iconoir' && IconoirComponent) {
      const iconoirProps = { ...props };
      if (iconoirProps.size !== undefined) {
        iconoirProps.width = iconoirProps.size;
        iconoirProps.height = iconoirProps.size;
        delete iconoirProps.size;
      }
      return <IconoirComponent ref={ref} {...iconoirProps} />;
    }
    return <LucideComponent ref={ref} {...props} />;
  });
};

// Export all remaining icons from lucide-react as fallbacks
export * from 'lucide-react';

export const AlertCircle = withIconFactory(Lucide.AlertCircle, Iconoir.WarningCircle);
export const AlertTriangle = withIconFactory(Lucide.AlertTriangle, Iconoir.WarningTriangle);
export const Archive = withIconFactory(Lucide.Archive, Iconoir.Archive);
export const ArchiveRestore = withIconFactory(Lucide.ArchiveRestore, Iconoir.Archive);
export const ArrowDown = withIconFactory(Lucide.ArrowDown, Iconoir.ArrowDown);
export const ArrowLeft = withIconFactory(Lucide.ArrowLeft, Iconoir.ArrowLeft);
export const ArrowUpCircle = withIconFactory(Lucide.ArrowUpCircle, Iconoir.ArrowUpCircle);
export const Ban = withIconFactory(Lucide.Ban, Iconoir.Prohibition);
export const Bell = withIconFactory(Lucide.Bell, Iconoir.Bell);
export const BellOff = withIconFactory(Lucide.BellOff, Iconoir.BellNotification);
export const Bot = withIconFactory(Lucide.Bot, Iconoir.Cpu);
export const Brain = withIconFactory(Lucide.Brain, Iconoir.Brain);
export const Bug = withIconFactory(Lucide.Bug, Iconoir.Bug);
export const BugIcon = withIconFactory(Lucide.BugIcon, Iconoir.Bug);
export const Camera = withIconFactory(Lucide.Camera, Iconoir.Camera);
export const Check = withIconFactory(Lucide.Check, Iconoir.Check);
export const CheckCircle2 = withIconFactory(Lucide.CheckCircle2, Iconoir.CheckCircle);
export const CheckIcon = withIconFactory(Lucide.CheckIcon, Iconoir.Check);
export const CheckSquare = withIconFactory(Lucide.CheckSquare, Iconoir.CheckSquare);
export const ChevronDown = withIconFactory(Lucide.ChevronDown, Iconoir.NavArrowDown);
export const ChevronDownIcon = withIconFactory(Lucide.ChevronDownIcon, Iconoir.NavArrowDown);
export const ChevronLeft = withIconFactory(Lucide.ChevronLeft, Iconoir.NavArrowLeft);
export const ChevronRight = withIconFactory(Lucide.ChevronRight, Iconoir.NavArrowRight);
export const ChevronRightIcon = withIconFactory(Lucide.ChevronRightIcon, Iconoir.NavArrowRight);
export const ChevronsDownUp = withIconFactory(Lucide.ChevronsDownUp, Iconoir.HelpCircle);
export const ChevronsUpDown = withIconFactory(Lucide.ChevronsUpDown, Iconoir.HelpCircle);
export const ChevronUp = withIconFactory(Lucide.ChevronUp, Iconoir.NavArrowUp);
export const ChevronUpIcon = withIconFactory(Lucide.ChevronUpIcon, Iconoir.NavArrowUp);
export const Circle = withIconFactory(Lucide.Circle, Iconoir.Circle);
export const CircleIcon = withIconFactory(Lucide.CircleIcon, Iconoir.Circle);
export const ArrowRight = withIconFactory(Lucide.ArrowRight, Iconoir.ArrowRight);
export const ClipboardList = withIconFactory(Lucide.ClipboardList, Iconoir.ClipboardCheck);
export const Clock = withIconFactory(Lucide.Clock, Iconoir.Clock);
export const CloudDownload = withIconFactory(Lucide.CloudDownload, Iconoir.CloudDownload);
export const Code = withIconFactory(Lucide.Code, Iconoir.Code);
export const Code2 = withIconFactory(Lucide.Code2, Iconoir.Code);
export const Cog = withIconFactory(Lucide.Cog, Iconoir.Settings);
export const Copy = withIconFactory(Lucide.Copy, Iconoir.Copy);
export const Cpu = withIconFactory(Lucide.Cpu, Iconoir.Cpu);
export const Crop = withIconFactory(Lucide.Crop, Iconoir.Crop);
export const Database = withIconFactory(Lucide.Database, Iconoir.Database);
export const DatabaseZap = withIconFactory(Lucide.DatabaseZap, Iconoir.DatabaseScript);
export const DollarSign = withIconFactory(Lucide.DollarSign, Iconoir.DollarCircle);
export const Download = withIconFactory(Lucide.Download, Iconoir.Download);
export const Edit2 = withIconFactory(Lucide.Edit2, Iconoir.EditPencil);
export const ExternalLink = withIconFactory(Lucide.ExternalLink, Iconoir.OpenNewWindow);
export const Eye = withIconFactory(Lucide.Eye, Iconoir.Eye);
export const EyeOff = withIconFactory(Lucide.EyeOff, Iconoir.EyeClosed);
export const FileCode = withIconFactory(Lucide.FileCode, Iconoir.CodeBrackets);
export const FileCode2 = withIconFactory(Lucide.FileCode2, Iconoir.CodeBrackets);
export const FileEdit = withIconFactory(Lucide.FileEdit, Iconoir.PageEdit);
export const FileText = withIconFactory(Lucide.FileText, Iconoir.Page);
export const Filter = withIconFactory(Lucide.Filter, Iconoir.Filter);
export const Flame = withIconFactory(Lucide.Flame, Iconoir.FireFlame);
export const Folder = withIconFactory(Lucide.Folder, Iconoir.Folder);
export const FolderOpen = withIconFactory(Lucide.FolderOpen, Iconoir.Folder);
export const FolderPlus = withIconFactory(Lucide.FolderPlus, Iconoir.Folder);
export const GitBranch = withIconFactory(Lucide.GitBranch, Iconoir.GitBranch);
export const GitCommit = withIconFactory(Lucide.GitCommit, Iconoir.GitCommit);
export const Github = withIconFactory(Lucide.Github, Iconoir.Github);
export const Globe = withIconFactory(Lucide.Globe, Iconoir.Globe);
export const GripVertical = withIconFactory(Lucide.GripVertical, Iconoir.MenuScale);
export const Hammer = withIconFactory(Lucide.Hammer, Iconoir.Wrench);
export const Hash = withIconFactory(Lucide.Hash, Iconoir.Hashtag);
export const HelpCircle = withIconFactory(Lucide.HelpCircle, Iconoir.HelpCircle);
export const History = withIconFactory(Lucide.History, Iconoir.HistoricShield);
export const Home = withIconFactory(Lucide.Home, Iconoir.HomeSimpleDoor);
export const Image = withIconFactory(Lucide.Image, Iconoir.HelpCircle);
export const ImageIcon = withIconFactory(Lucide.ImageIcon, Iconoir.HelpCircle);
export const Inbox = withIconFactory(Lucide.Inbox, Iconoir.HelpCircle);
export const Info = withIconFactory(Lucide.Info, Iconoir.InfoCircle);
export const InfoIcon = withIconFactory(Lucide.InfoIcon, Iconoir.InfoCircle);
export const KeyRound = withIconFactory(Lucide.KeyRound, Iconoir.Key);
export const Layout = withIconFactory(Lucide.Layout, Iconoir.LayoutLeft);
export const LightbulbIcon = withIconFactory(Lucide.LightbulbIcon, Iconoir.HelpCircle);
export const Lightbulb = withIconFactory(Lucide.Lightbulb, Iconoir.LightBulb);
export const Loader = withIconFactory(Lucide.Loader, Iconoir.RefreshDouble);
export const Loader2 = withIconFactory(Lucide.Loader2, Iconoir.Refresh);
export const Lock = withIconFactory(Lucide.Lock, Iconoir.Lock);
export const LogOut = withIconFactory(Lucide.LogOut, Iconoir.LogOut);
export const Logs = withIconFactory(Lucide.Logs, Iconoir.List);
export const Maximize2 = withIconFactory(Lucide.Maximize2, Iconoir.Maximize);
export const Menu = withIconFactory(Lucide.Menu, Iconoir.Menu);
export const MessageSquare = withIconFactory(Lucide.MessageSquare, Iconoir.ChatBubble);
export const MessageSquarePlus = withIconFactory(Lucide.MessageSquarePlus, Iconoir.ChatBubble);
export const MessagesSquare = withIconFactory(Lucide.MessagesSquare, Iconoir.ChatBubbleEmpty);
export const Minimize2 = withIconFactory(Lucide.Minimize2, Iconoir.Collapse);
export const Minus = withIconFactory(Lucide.Minus, Iconoir.Minus);
export const Monitor = withIconFactory(Lucide.Monitor, Iconoir.MacOsWindow);
export const MonitorSmartphone = withIconFactory(Lucide.MonitorSmartphone, Iconoir.MacOsWindow);
export const MoreVertical = withIconFactory(Lucide.MoreVertical, Iconoir.MoreVert);
export const MousePointerClick = withIconFactory(Lucide.MousePointerClick, Iconoir.CursorPointer);
export const Move = withIconFactory(Lucide.Move, Iconoir.HelpCircle);
export const Package = withIconFactory(Lucide.Package, Iconoir.Package);
export const Palette = withIconFactory(Lucide.Palette, Iconoir.Palette);
export const PanelLeft = withIconFactory(Lucide.PanelLeft, Iconoir.LayoutLeft);
export const PanelLeftClose = withIconFactory(Lucide.PanelLeftClose, Iconoir.SidebarCollapse);
export const PanelLeftOpen = withIconFactory(Lucide.PanelLeftOpen, Iconoir.SidebarExpand);
export const PanelRightClose = withIconFactory(Lucide.PanelRightClose, Iconoir.SidebarCollapse);
export const PanelRightOpen = withIconFactory(Lucide.PanelRightOpen, Iconoir.SidebarExpand);
export const Paperclip = withIconFactory(Lucide.Paperclip, Iconoir.HelpCircle);
export const Pencil = withIconFactory(Lucide.Pencil, Iconoir.EditPencil);
export const Play = withIconFactory(Lucide.Play, Iconoir.Play);
export const Plus = withIconFactory(Lucide.Plus, Iconoir.Plus);
export const PlusIcon = withIconFactory(Lucide.PlusIcon, Iconoir.Plus);
export const Power = withIconFactory(Lucide.Power, Iconoir.SystemShut);
export const Quote = withIconFactory(Lucide.Quote, Iconoir.Quote);
export const RefreshCw = withIconFactory(Lucide.RefreshCw, Iconoir.Refresh);
export const RotateCcw = withIconFactory(Lucide.RotateCcw, Iconoir.Undo);
export const Save = withIconFactory(Lucide.Save, Iconoir.FloppyDisk);
export const Search = withIconFactory(Lucide.Search, Iconoir.Search);
export const SearchIcon = withIconFactory(Lucide.SearchIcon, Iconoir.Search);
export const SendHorizontal = withIconFactory(Lucide.SendHorizontal, Iconoir.SendDiagonal);
export const SendHorizontalIcon = withIconFactory(Lucide.SendHorizontalIcon, Iconoir.SendDiagonal);
export const Server = withIconFactory(Lucide.Server, Iconoir.Server);
export const Settings = withIconFactory(Lucide.Settings, Iconoir.Settings);
export const Settings2 = withIconFactory(Lucide.Settings2, Iconoir.Settings);
export const Shield = withIconFactory(Lucide.Shield, Iconoir.Shield);
export const ShieldAlert = withIconFactory(Lucide.ShieldAlert, Iconoir.ShieldAlert);
export const ShieldCheck = withIconFactory(Lucide.ShieldCheck, Iconoir.ShieldCheck);
export const Smartphone = withIconFactory(Lucide.Smartphone, Iconoir.SmartphoneDevice);
export const Sparkles = withIconFactory(Lucide.Sparkles, Iconoir.Sparks);
export const Square = withIconFactory(Lucide.Square, Iconoir.Square);
export const Star = withIconFactory(Lucide.Star, Iconoir.Star);
export const StickyNote = withIconFactory(Lucide.StickyNote, Iconoir.Page);
export const StopCircle = withIconFactory(Lucide.StopCircle, Iconoir.HelpCircle);
export const StopCircleIcon = withIconFactory(Lucide.StopCircleIcon, Iconoir.HelpCircle);
export const Tablet = withIconFactory(Lucide.Tablet, Iconoir.SmartphoneDevice);
export const Terminal = withIconFactory(Lucide.Terminal, Iconoir.Terminal);
export const Trash2 = withIconFactory(Lucide.Trash2, Iconoir.Trash);
export const TrashIcon = withIconFactory(Lucide.TrashIcon, Iconoir.Trash);
export const Triangle = withIconFactory(Lucide.Triangle, Iconoir.Triangle);
export const Type = withIconFactory(Lucide.Type, Iconoir.Type);
export const Undo = withIconFactory(Lucide.Undo, Iconoir.Undo);
export const Upload = withIconFactory(Lucide.Upload, Iconoir.Upload);
export const User = withIconFactory(Lucide.User, Iconoir.User);
export const Wrench = withIconFactory(Lucide.Wrench, Iconoir.Wrench);
export const X = withIconFactory(Lucide.X, Iconoir.Xmark);
export const XCircle = withIconFactory(Lucide.XCircle, Iconoir.XmarkCircle);
export const XIcon = withIconFactory(Lucide.XIcon, Iconoir.Xmark);
export const Zap = withIconFactory(Lucide.Zap, Iconoir.Flash);
export const Box = withIconFactory(Lucide.Box, Iconoir.BoxIso);
export const XSquare = withIconFactory(Lucide.XSquare, Iconoir.Square);
// Workspace & Details missing icons
export const Calendar = withIconFactory(Lucide.Calendar, Iconoir.Calendar);
export const ClipboardCopy = withIconFactory(Lucide.ClipboardCopy, Iconoir.PasteClipboard);
export const FolderInput = withIconFactory(Lucide.FolderInput, Iconoir.FolderPlus);
export const FolderX = withIconFactory(Lucide.FolderX, Iconoir.FolderMinus);
export const MapPin = withIconFactory(Lucide.MapPin, Iconoir.MapPin);
export const Pin = withIconFactory(Lucide.Pin, Iconoir.Pin);
export const PinOff = withIconFactory(Lucide.PinOff, Iconoir.PinSlash);
export const MessageCircle = withIconFactory(Lucide.MessageCircle, Iconoir.ChatBubble);
export const MessageSquareText = withIconFactory(Lucide.MessageSquareText, Iconoir.MessageText);
// Git & Connector icons
export const ArrowDownToLine = withIconFactory(Lucide.ArrowDownToLine, Iconoir.ArrowDown);
export const Clipboard = withIconFactory(Lucide.Clipboard, Iconoir.ClipboardCheck);
export const EllipsisVertical = withIconFactory(Lucide.EllipsisVertical, Iconoir.MoreVert);
export const FileWarning = withIconFactory(Lucide.FileWarning, Iconoir.WarningTriangle);
export const GitMerge = withIconFactory(Lucide.GitMerge, Iconoir.GitMerge);
export const GitPullRequestArrow = withIconFactory(Lucide.GitPullRequestArrow, Iconoir.GitPullRequest);
export const HardDrive = withIconFactory(Lucide.HardDrive, Iconoir.HardDrive);
export const MoreHorizontal = withIconFactory(Lucide.MoreHorizontal, Iconoir.MoreHoriz);
export const Network = withIconFactory(Lucide.Network, Iconoir.Network);
export const UserPlus = withIconFactory(Lucide.UserPlus, Iconoir.UserPlus);
export const Users = withIconFactory(Lucide.Users, Iconoir.Group);
// Visual editor & Annotator icons
export const AlignCenter = withIconFactory(Lucide.AlignCenter, Iconoir.AlignCenter);
export const AlignJustify = withIconFactory(Lucide.AlignJustify, Iconoir.AlignJustify);
export const AlignLeft = withIconFactory(Lucide.AlignLeft, Iconoir.AlignLeft);
export const AlignRight = withIconFactory(Lucide.AlignRight, Iconoir.AlignRight);
export const MousePointer2 = withIconFactory(Lucide.MousePointer2, Iconoir.CursorPointer);
export const MoveUpRight = withIconFactory(Lucide.MoveUpRight, Iconoir.ArrowUpRight);
export const Redo = withIconFactory(Lucide.Redo, Iconoir.Redo);
export const Wand2 = withIconFactory(Lucide.Wand2, Iconoir.MagicWand);
// Remaining icons (comprehensive audit)
export const AlertOctagon = withIconFactory(Lucide.AlertOctagon, Iconoir.WarningCircle);
export const ArrowLeftRight = withIconFactory(Lucide.ArrowLeftRight, Iconoir.ArrowSeparate);
export const ArrowRightLeft = withIconFactory(Lucide.ArrowRightLeft, Iconoir.ArrowSeparate);
export const ArrowUp = withIconFactory(Lucide.ArrowUp, Iconoir.ArrowUp);
export const ArrowUpDown = withIconFactory(Lucide.ArrowUpDown, Iconoir.ArrowSeparateVertical);
export const BarChart3 = withIconFactory(Lucide.BarChart3, Iconoir.StatsUpSquare);
export const Blocks = withIconFactory(Lucide.Blocks, Iconoir.BoxIso);
export const CheckCircle = withIconFactory(Lucide.CheckCircle, Iconoir.CheckCircle);
export const CircleX = withIconFactory(Lucide.CircleX, Iconoir.XmarkCircle);
export const Coins = withIconFactory(Lucide.Coins, Iconoir.Coins);
export const Diff = withIconFactory(Lucide.Diff, Iconoir.GitCompare);
export const Edit = withIconFactory(Lucide.Edit, Iconoir.EditPencil);
export const Edit3 = withIconFactory(Lucide.Edit3, Iconoir.EditPencil);
export const File = withIconFactory(Lucide.File, Iconoir.Page);
export const FilePlus = withIconFactory(Lucide.FilePlus, Iconoir.PagePlus);
export const FileSearch = withIconFactory(Lucide.FileSearch, Iconoir.PageSearch);
export const FileX = withIconFactory(Lucide.FileX, Iconoir.PageMinus);
export const FolderTree = withIconFactory(Lucide.FolderTree, Iconoir.Folder);
export const GripHorizontal = withIconFactory(Lucide.GripHorizontal, Iconoir.MenuScale);
export const List = withIconFactory(Lucide.List, Iconoir.List);
export const ListChecks = withIconFactory(Lucide.ListChecks, Iconoir.TaskList);
export const ListTodo = withIconFactory(Lucide.ListTodo, Iconoir.TaskList);
export const MessageCircleQuestion = withIconFactory(Lucide.MessageCircleQuestion, Iconoir.ChatBubbleQuestion);
export const Music = withIconFactory(Lucide.Music, Iconoir.MusicDoubleNote);
export const PackageCheck = withIconFactory(Lucide.PackageCheck, Iconoir.Package);
export const Rabbit = withIconFactory(Lucide.Rabbit, Iconoir.HelpCircle);
export const Rocket = withIconFactory(Lucide.Rocket, Iconoir.Rocket);
export const Scissors = withIconFactory(Lucide.Scissors, Iconoir.Scissor);
export const ScrollText = withIconFactory(Lucide.ScrollText, Iconoir.Page);
export const Send = withIconFactory(Lucide.Send, Iconoir.SendDiagonal);
export const SendToBack = withIconFactory(Lucide.SendToBack, Iconoir.SendDiagonal);
export const Table = withIconFactory(Lucide.Table, Iconoir.Table);
export const Table2 = withIconFactory(Lucide.Table2, Iconoir.TableRows);
export const TabletSmartphone = withIconFactory(Lucide.TabletSmartphone, Iconoir.SmartphoneDevice);
export const TestTube = withIconFactory(Lucide.TestTube, Iconoir.Flask);
export const TrendingUp = withIconFactory(Lucide.TrendingUp, Iconoir.GraphUp);
export const Undo2 = withIconFactory(Lucide.Undo2, Iconoir.Undo);
export const Video = withIconFactory(Lucide.Video, Iconoir.VideoCamera);
export const Wifi = withIconFactory(Lucide.Wifi, Iconoir.Wifi);

// Custom Brand SVGs
const NeonSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 102 28" fill="none" width={props.size || props.width || 68} height={props.size || props.height || 18}>
    <path fill="currentColor" fillRule="evenodd" d="M0 4.828C0 2.16 2.172 0 4.851 0h18.436c2.679 0 4.85 2.161 4.85 4.828V20.43c0 2.758-3.507 3.955-5.208 1.778l-5.318-6.809v8.256c0 2.4-1.955 4.345-4.367 4.345H4.851C2.172 28 0 25.839 0 23.172zm4.851-.966a.97.97 0 0 0-.97.966v18.344c0 .534.435.966.97.966h8.539c.268 0 .34-.216.34-.483v-11.07c0-2.76 3.507-3.956 5.208-1.779l5.319 6.809V4.828c0-.534.05-.966-.485-.966z" clipRule="evenodd" />
    <path fill="currentColor" d="M23.287 0c2.679 0 4.85 2.161 4.85 4.828V20.43c0 2.758-3.507 3.955-5.208 1.778l-5.319-6.809v8.256c0 2.4-1.954 4.345-4.366 4.345a.484.484 0 0 0 .485-.483V12.584c0-2.758 3.508-3.955 5.21-1.777l5.318 6.808V.965a.97.97 0 0 0-.97-.965" />
    <path fill="currentColor" d="M48.112 7.432v8.032l-7.355-8.032H36.93v13.136h3.49v-8.632l8.01 8.632h3.173V7.432zM58.075 17.64v-2.326h7.815v-2.797h-7.815V10.36h9.48V7.432H54.514v13.136H67.75v-2.927zM77.028 21c4.909 0 8.098-2.552 8.098-7s-3.19-7-8.098-7c-4.91 0-8.081 2.552-8.081 7s3.172 7 8.08 7m0-3.115c-2.73 0-4.413-1.408-4.413-3.885s1.701-3.885 4.413-3.885c2.729 0 4.412 1.408 4.412 3.885s-1.683 3.885-4.412 3.885M98.508 7.432v8.032l-7.355-8.032h-3.828v13.136h3.491v-8.632l8.01 8.632H102V7.432z" />
  </svg>
));
export const NeonIcon = withIconFactory(NeonSvgBase, NeonSvgBase);

const GoogleSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 488 512" width={props.size || props.width || 16} height={props.size || props.height || 16}>
    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
  </svg>
));
export const GoogleIcon = withIconFactory(GoogleSvgBase, GoogleSvgBase);

const BunnySvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 23 26" width={props.size || props.width || 18} height={props.size || props.height || 21}>
    <mask id="bunny-mask0" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="5" y="2" width="11" height="7">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.94005 7.76989L15.0458 8.65275C11.2162 7.99015 10.9806 4.8035 5.82821 2.00031C5.26561 3.85867 6.43069 7.21036 9.94005 7.76989Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask0)">
      <rect x="5.26562" y="2.00031" width="9.7802" height="6.65245" fill="currentColor"/>
    </g>
    <mask id="bunny-mask1" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="5" y="2" width="14" height="11">
      <path fillRule="evenodd" clipRule="evenodd" d="M5.82812 2.00031C10.9805 4.80289 11.2161 7.99015 15.0457 8.65275C16.9679 8.98528 15.2322 12.2652 13.1818 11.9192C16.8654 13.1714 20.2263 9.83379 18.3041 8.78712L5.82812 2.00031Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask1)">
      <rect x="5.82812" y="2.00031" width="14.3988" height="11.1711" fill="currentColor"/>
    </g>
    <mask id="bunny-mask2" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="7" y="8" width="16" height="15">
      <path fillRule="evenodd" clipRule="evenodd" d="M13.1864 11.92C13.1857 11.92 13.1839 11.92 13.1833 11.92C12.9422 11.8789 12.6968 11.7887 12.452 11.6359C10.9108 10.677 9.3598 10.3665 7.95605 10.5181C10.8856 10.8764 13.6717 14.7134 13.3256 17.5534C13.3864 18.5234 13.0459 19.5117 12.3053 20.2523L10.6151 21.9425C11.9188 22.8009 13.8993 21.9063 14.5042 20.6615L17.9136 13.6477C18.7504 13.4495 24.0905 12.0654 21.6812 10.6242L18.3117 8.79102C20.2186 9.84198 16.8632 13.1685 13.1864 11.92Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask2)">
      <rect x="7.95605" y="8.79102" width="16.1345" height="14.0098" fill="currentColor"/>
    </g>
    <mask id="bunny-mask3" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="2" y="10" width="12" height="14">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.95292 10.5177C3.36805 11.0165 0.36423 16.4578 4.44724 20.3911L7.86764 23.8115C5.62398 21.5679 5.40986 18.2867 6.79458 16.0056C6.94306 15.751 7.12711 15.5111 7.34553 15.2927C8.71492 13.9221 10.9353 13.9221 12.3046 15.2927C12.9335 15.921 13.2734 16.729 13.3249 17.5523C13.671 14.713 10.8862 10.8784 7.95844 10.5177H7.95292Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask3)">
      <rect x="0.364258" y="10.5177" width="13.3074" height="13.2939" fill="currentColor"/>
    </g>
    <mask id="bunny-mask4" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="5" y="16" width="6" height="10">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.86766 23.8115L9.79351 25.7368C10.4365 25.2257 10.8212 23.7275 9.82419 22.7311L7.34493 20.2512C6.19335 19.1003 6.01052 17.3487 6.79399 16.0056C5.40988 18.2867 5.624 21.5679 7.86766 23.8115Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask4)">
      <path d="M8.39986 28.4285L0.571289 21.3828L7.83174 13.3155L15.6603 20.3612L8.39986 28.4285Z" fill="currentColor"/>
    </g>
    <mask id="bunny-mask5" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="12" y="0" width="7" height="8">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5039 4.53945L18.2428 7.66168L12.9248 0.600006C12.1971 1.42888 11.8444 3.07251 12.5039 4.53945Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask5)">
      <rect x="11.8442" y="0.600006" width="6.39845" height="7.06167" fill="currentColor"/>
    </g>
    <mask id="bunny-mask6" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="8" y="16" width="4" height="4">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.51953 17.7722C8.51953 18.4937 9.10483 19.0784 9.82511 19.0784C10.5472 19.0784 11.1319 18.4937 11.1319 17.7722C11.1319 17.0513 10.5472 16.466 9.82511 16.466C9.10422 16.466 8.51953 17.0513 8.51953 17.7722Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask6)">
      <rect x="8.51953" y="16.466" width="2.61239" height="2.61239" fill="currentColor"/>
    </g>
    <mask id="bunny-mask7" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="10" width="3" height="3">
      <path fillRule="evenodd" clipRule="evenodd" d="M0.200195 11.4581C0.200195 12.179 0.786111 12.7643 1.507 12.7643C2.22851 12.7643 2.81258 12.179 2.81258 11.4581C2.81258 10.7372 2.22851 10.1519 1.507 10.1519C0.786111 10.1519 0.200195 10.7372 0.200195 11.4581Z" fill="white"/>
    </mask>
    <g mask="url(#bunny-mask7)">
      <rect x="0.200195" y="10.1519" width="2.61239" height="2.61239" fill="currentColor"/>
    </g>
  </svg>
));
export const BunnyIcon = withIconFactory(BunnySvgBase, BunnySvgBase);

const SupabaseSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" width={props.size || props.width || 16} height={props.size || props.height || 16}>
    <path fill="currentColor" d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
  </svg>
));
export const SupabaseIcon = withIconFactory(SupabaseSvgBase, SupabaseSvgBase);

const PocketBaseSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" width={props.size || props.width || 16} height={props.size || props.height || 16}>
    <path fill="currentColor" d="M5.684 12a.632.632 0 0 1-.631-.632V4.421c0-.349.282-.632.631-.632h2.37c.46 0 .889.047 1.287.139.407.084.758.23 1.053.44.303.202.541.475.715.82.173.335.26.75.26 1.246 0 .479-.092.894-.273 1.247a2.373 2.373 0 0 1-.715.869 3.11 3.11 0 0 1-1.053.503c-.398.11-.823.164-1.273.164h-.46a.632.632 0 0 0-.632.632v1.52a.632.632 0 0 1-.632.631Zm1.279-4.888c0 .349.283.632.632.632h.343c1.04 0 1.56-.437 1.56-1.31 0-.428-.135-.73-.404-.907-.26-.176-.645-.264-1.156-.264h-.343a.632.632 0 0 0-.632.631Zm6.3 13.098a.632.632 0 0 1-.631-.631v-6.947a.63.63 0 0 1 .631-.632h2.203c.44 0 .845.034 1.216.1.38.06.708.169.984.328.276.16.492.37.647.63.164.26.246.587.246.982 0 .185-.03.37-.09.554a1.537 1.537 0 0 1-.26.516 1.857 1.857 0 0 1-1.076.7.031.031 0 0 0-.023.03c0 .015.01.028.025.03.591.111 1.04.32 1.346.626.311.31.466.743.466 1.297 0 .42-.082.78-.246 1.083a2.153 2.153 0 0 1-.685.755 3.4 3.4 0 0 1-1.036.441 5.477 5.477 0 0 1-1.268.139zm1.271-5.542c0 .349.283.631.632.631h.21c.465 0 .802-.088 1.009-.264.207-.176.31-.424.31-.743 0-.302-.107-.516-.323-.642-.207-.135-.535-.202-.984-.202h-.222a.632.632 0 0 0-.632.632Zm0 3.463c0 .349.283.631.632.631h.39c1.019 0 1.528-.369 1.528-1.108 0-.36-.125-.621-.376-.78-.241-.16-.625-.24-1.152-.24h-.39a.632.632 0 0 0-.632.632zM1.389 0C.629 0 0 .629 0 1.389V15.03a1.4 1.4 0 0 0 1.389 1.39H8.21a.632.632 0 0 0 .63-.632.632.632 0 0 0-.63-.63H1.389c-.078 0-.125-.05-.125-.128V1.39c0-.078.047-.125.125-.125H15.03c.078 0 .127.047.127.125v6.82a.632.632 0 0 0 .631.63.632.632 0 0 0 .633-.63V1.389A1.4 1.4 0 0 0 15.032 0ZM15.79 7.578a.632.632 0 0 0-.632.633.632.632 0 0 0 .631.63h6.822c.078 0 .125.05.125.128V22.61c0 .078-.047.125-.125.125H8.97c-.077 0-.127-.047-.127-.125v-6.82a.632.632 0 0 0-.631-.63.632.632 0 0 0-.633.63v6.822A1.4 1.4 0 0 0 8.968 24h13.643c.76 0 1.389-.629 1.389-1.389V8.97a1.4 1.4 0 0 0-1.389-1.39Z"/>
  </svg>
));
export const PocketBaseIcon = withIconFactory(PocketBaseSvgBase, PocketBaseSvgBase);

// Framework SVGs
const ReactSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 12 12)" />
  </svg>
));
export const ReactIcon = withIconFactory(ReactSvgBase, ReactSvgBase);

const NextSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.77 14.358L10 7.5V16h1.5V10.08l5.467 7.158a9.955 9.955 0 01-4.967 1.262C7.03 18.5 3.5 14.97 3.5 10S7.03 1.5 12 1.5 20.5 5.03 20.5 10a9.96 9.96 0 01-3.73 7.858z" fill="currentColor" />
  </svg>
));
export const NextIcon = withIconFactory(NextSvgBase, NextSvgBase);

const VueSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="none">
    <path d="M2 3h4l6 10.5L18 3h4L12 21 2 3z" fill="currentColor" />
    <path d="M7 3h4l1 1.73L13 3h4l-5 8.66L7 3z" fill="currentColor" opacity="0.7" />
  </svg>
));
export const VueIcon = withIconFactory(VueSvgBase, VueSvgBase);

const AstroSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.074 16.86c-.72.616-2.157 1.035-3.812 1.035-2.032 0-3.735-.632-4.187-1.483-.161.55-.198 1.176-.198 1.68 0 0-.107 1.745 1.137 2.908 0-.63.51-1.14 1.14-1.14 1.075 0 1.074.94 1.074 1.14v.113c0 .783.478 1.456 1.157 1.737a1.89 1.89 0 01-.157-.764c0-1.052.72-1.443 1.589-1.92l.087-.049c.94-.525 2.04-1.132 2.04-2.85 0-.277-.036-.55-.107-.813a3.822 3.822 0 01-.763.406z" fill="currentColor" />
    <path d="M15.645 2.4L12.29 13.581a.4.4 0 01-.757.043L8.78 7.564a.4.4 0 00-.73-.02L5.327 13.38a.4.4 0 01-.718.012L2.4 9.2M18 2.4l-2.063 6.875" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
    <path d="M8.438 2.693c.057-.175.31-.175.367 0l2.665 8.197a.19.19 0 01-.18.248H5.953a.19.19 0 01-.18-.248l2.665-8.197z" fill="currentColor" opacity="0.3" />
  </svg>
));
export const AstroIcon = withIconFactory(AstroSvgBase, AstroSvgBase);

const SvelteSvgBase = forwardRef<SVGSVGElement, any>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="none">
    <path d="M19.58 4.01a6.44 6.44 0 00-8.88-1.66L6.22 5.65a5.34 5.34 0 00-2.37 3.54 5.56 5.56 0 00.54 3.63 5.07 5.07 0 00-.76 1.89 5.65 5.65 0 00.96 4.27 6.44 6.44 0 008.88 1.66l4.48-3.3a5.34 5.34 0 002.37-3.54 5.56 5.56 0 00-.54-3.63 5.07 5.07 0 00.76-1.89 5.65 5.65 0 00-.96-4.27z" fill="currentColor" />
    <path d="M9.77 19.64a3.92 3.92 0 01-4.21-1.54 3.43 3.43 0 01-.59-2.6 3.3 3.3 0 01.11-.47l.12-.34.31.23a6.2 6.2 0 001.9 1.05l.18.06-.02.18a1.04 1.04 0 00.19.67 1.2 1.2 0 001.28.47 1.12 1.12 0 00.32-.15l4.48-3.3a.93.93 0 00.41-.62 1.05 1.05 0 00-.18-.8 1.2 1.2 0 00-1.28-.47 1.12 1.12 0 00-.32.15l-1.71 1.26a3.67 3.67 0 01-1.05.5 3.92 3.92 0 01-4.21-1.54 3.43 3.43 0 01-.59-2.6 3.07 3.07 0 011.36-2.03l4.48-3.3a3.67 3.67 0 011.05-.5 3.92 3.92 0 014.21 1.54 3.43 3.43 0 01.59 2.6 3.3 3.3 0 01-.11.47l-.12.34-.31-.23a6.2 6.2 0 00-1.9-1.05l-.18-.06.02-.18a1.04 1.04 0 00-.19-.67 1.2 1.2 0 00-1.28-.47 1.12 1.12 0 00-.32.15l-4.48 3.3a.93.93 0 00-.41.62 1.05 1.05 0 00.18.8 1.2 1.2 0 001.28.47 1.12 1.12 0 00.32-.15l1.71-1.26a3.67 3.67 0 011.05-.5 3.92 3.92 0 014.21 1.54 3.43 3.43 0 01.59 2.6 3.07 3.07 0 01-1.36 2.03l-4.48 3.3a3.67 3.67 0 01-1.05.5z" fill="currentColor" opacity="0.3" />
  </svg>
));
export const SvelteIcon = withIconFactory(SvelteSvgBase, SvelteSvgBase);
