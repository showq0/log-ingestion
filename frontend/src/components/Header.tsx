
function Header() {
    return (
        <header className="header">
            <h1 className="logo">LogFlow</h1>

            <div className="connection-status">
                <span className="status-dot" />
                <span>Live monitoring</span>
            </div>
        </header>
    );
}

export default Header;
