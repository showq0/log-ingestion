
import Header from "./components/Header";
import LatestLogs from "./components/LatestLogs";
import LogQuery from "./components/LogQuery";
import Aggregations from "./components/Aggregations";

function App() {
  return (
    <>
      <Header />

      <main className="dashboard">
        <LatestLogs />
        <LogQuery />
        <Aggregations />
      </main>
    </>
  );
}

export default App;
