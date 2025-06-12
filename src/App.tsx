import "./App.css";
import KeebScene from "./Keeb";

const App = () => {
  return (
    <div className="content">
      <KeebScene className="keeb" />
      <div className="slant">
        <h1>Keylocity</h1>
        <p>Hit some random keys :3</p>
      </div>
    </div>
  );
};

export default App;
